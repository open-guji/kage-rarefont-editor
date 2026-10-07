// SPDX-License-Identifier: GPL-3.0-only
// Emscripten embind glue for the kage-cpp (Bezier-optimised) engine.
// Exposes a single KageEngine class to JavaScript.

#include <memory>
#include <string>
#include <vector>

#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "canva.h"
#include "export.h"
#include "gwdata.h"
#include "kage.h"
#include "kagefont.h"

using namespace emscripten;

namespace Kage {
    // Defined in export.cpp but not declared in export.h.
    std::string Contour2SVGstr(Contour contour);
}

namespace {

std::string js_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        default: out += c;
        }
    }
    return out;
}

// Split a glyph source into one Stroke per line ($ or \n delimited),
// mirroring the editor's Glyph: string[] where each element is one fragment.
std::vector<Kage::Stroke> splitLines(const std::string& data) {
    std::vector<Kage::Stroke> lines;
    std::string cur;
    for (size_t i = 0; i <= data.size(); i++) {
        char c = (i < data.size()) ? data[i] : '$';
        if (c == '$' || c == '\n') {
            auto parsed = Kage::StrokesParse(cur);
            if (!parsed.empty()) lines.push_back(parsed[0]);
            cur.clear();
        } else {
            cur += c;
        }
    }
    return lines;
}

class KageEngine {
public:
    // font: 0 = Mincho (宋体), 1 = Gothic (黑体)
    KageEngine(int font)
        : _font(font),
          _kage(font == 1 ? Kage::KAGEFONT_GOTHIC
                          : Kage::KAGEFONT_MINCHO, 0) {
        _kage.SetDBsearchCallback([this](const std::string& name) {
            return dbSearch(name);
        });
    }

    // Register a JS callback: (name: string) => kage source string
    void setDbSearch(val callback) {
        _callback = callback;
    }

    void pushBuhin(const std::string& name, const std::string& data) {
        _kage.PushBuhin(name, data);
    }

    void setBuhin(const std::string& name, const std::string& data) {
        _kage.SetBuhin(name, data);
    }

    // font: 0 = Mincho (宋体), 1 = Gothic (黑体)
    void setFont(int font) {
        _font = font;
        _kage.SetFont(font == 1 ? Kage::KAGEFONT_GOTHIC
                                : Kage::KAGEFONT_MINCHO, 0);
    }

    // 0 OK, 1 not found, 2 loop
    int checkGlyph(const std::string& name) {
        return static_cast<int>(_kage.CheckGlyph(name));
    }

    void setNotDefGlyph(const std::string& data) {
        _kage.SetNotDefGlyph(Kage::StrokesParse(data));
    }

    // Render the glyph given by `$`-joined KAGE data into one SVG string.
    // pixel: requested width/height (viewBox remains 0..200).
    std::string renderSvg(const std::string& data, int pixel) {
        Kage::Canva ca;
        try {
            auto strokes = Kage::StrokesParse(data);
            _kage.MakeGlyph2(ca, strokes);
        } catch (...) {
            return "";
        }
        std::string svg;
        try {
            svg = Kage::Canva2SVG(ca);
        } catch (...) {
            return "";
        }
        return resizeSvg(svg, pixel);
    }

    // Same as renderSvg but looking the glyph up by name.
    std::string renderSvgByName(const std::string& name, int pixel) {
        Kage::Canva ca;
        try {
            _kage.MakeGlyph(ca, name);
        } catch (...) {
            return "";
        }
        std::string svg;
        try {
            svg = Kage::Canva2SVG(ca);
        } catch (...) {
            return "";
        }
        return resizeSvg(svg, pixel);
    }

    // Per-stroke separated rendering (mirrors makeGlyphSeparated of the JS
    // engine). Input `data` is the glyph source joined by "$" — one fragment
    // per line, exactly like the editor's Glyph array.
    // Returns a JSON string: array (line) of arrays (contour) of
    // [pathData, closed].
    std::string renderStrokePaths(const std::string& data) {
        if (data.empty()) return "[]";
        auto lines = splitLines(data);
        auto grouped = _kage.MakeGlyphSeparatedOut(lines);
        std::string out = "[";
        for (size_t i = 0; i < grouped.size(); i++) {
            if (i > 0) out += ",";
            out += "[";
            bool first = true;
            for (auto& ca : grouped[i]) {
                for (auto c : ca.Contours()) {
                    std::string d;
                    try {
                        d = Kage::Contour2SVGstr(c);
                    } catch (...) {
                        continue;
                    }
                    if (!first) out += ",";
                    first = false;
                    out += "[\"" + js_escape(d) + "\"," +
                        (c.isClosed() ? "true" : "false") + "]";
                }
            }
            out += "]";
        }
        out += "]";
        return out;
    }

    // One SVG <path> string per line, merged (for the export feature).
    std::string renderPaths(const std::string& data) {
        Kage::Canva ca;
        try {
            _kage.MakeGlyph2(ca, Kage::StrokesParse(data));
        } catch (...) {
            return "[]";
        }
        std::string out = "[";
        bool first = true;
        for (auto c : ca.Contours()) {
            std::string d;
            try {
                d = Kage::Contour2SVGstr(c);
            } catch (...) {
                continue;
            }
            if (!first) out += ",";
            first = false;
            out += "\"" + js_escape(d) + "\"";
        }
        out += "]";
        return out;
    }

private:
    std::string dbSearch(const std::string& name) {
        if (_callback.isUndefined() || _callback.isNull()) return "";
        try {
            val result = _callback(val(name));
            if (result.isUndefined() || result.isNull()) return "";
            return result.as<std::string>();
        } catch (...) {
            return "";
        }
    }

    static std::string resizeSvg(std::string svg, int pixel) {
        if (pixel <= 0) return svg;
        const std::string w = "width=\"" + std::to_string(pixel) + "\"";
        const std::string h = "height=\"" + std::to_string(pixel) + "\"";
        // width="200" is 11 chars, height="200" is 12 chars.
        size_t wp = svg.find("width=\"200\"");
        if (wp != std::string::npos) svg.replace(wp, 11, w);
        size_t hp = svg.find("height=\"200\"");
        if (hp != std::string::npos) svg.replace(hp, 12, h);
        return svg;
    }

    int _font;
    Kage::Kage _kage;
    val _callback = val::undefined();
};

EMSCRIPTEN_BINDINGS(kage_cpp) {
    class_<KageEngine>("KageEngine")
        .constructor<int>()
        .function("setDbSearch", &KageEngine::setDbSearch)
        .function("pushBuhin", &KageEngine::pushBuhin)
        .function("setBuhin", &KageEngine::setBuhin)
        .function("setFont", &KageEngine::setFont)
        .function("checkGlyph", &KageEngine::checkGlyph)
        .function("setNotDefGlyph", &KageEngine::setNotDefGlyph)
        .function("renderSvg", &KageEngine::renderSvg)
        .function("renderSvgByName", &KageEngine::renderSvgByName)
        .function("renderStrokePaths", &KageEngine::renderStrokePaths)
        .function("renderPaths", &KageEngine::renderPaths);
}

} // namespace
