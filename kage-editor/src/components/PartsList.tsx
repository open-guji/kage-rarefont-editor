// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2025  kurgm

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { renderThumbnail } from '../thumbnail';

import styles from './PartsList.module.css';

const blankImage = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

// Render each thumbnail in the browser once it scrolls into view.
const useRenderedImageURL = (name: string) => {
  const ref = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const img = ref.current;
    if (!img) {
      return;
    }
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      observer.disconnect();
      renderThumbnail(name)
        .then((dataUrl) => {
          if (!cancelled) {
            setUrl(dataUrl);
          }
        })
        .catch((err) => console.error(err));
    });
    observer.observe(img);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [name]);
  return [ref, url] as const;
};

interface PartsListItemProps {
  name: string;
  onClick: (evt: React.MouseEvent<HTMLImageElement>) => void;
  onMouseEnter: (evt: React.MouseEvent<HTMLImageElement>) => void;
}

const PartsListItem = ({ name, onClick, onMouseEnter }: PartsListItemProps) => {
  const [ref, renderedUrl] = useRenderedImageURL(name);
  return (
    <img
      ref={ref}
      alt={name} title={name}
      data-name={name}
      src={renderedUrl ?? blankImage}
      width={50} height={50}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    />
  );
};

interface PartsListProps {
  names: string[];
  handleItemClick: (partName: string, evt: React.MouseEvent<HTMLImageElement>) => void;
  handleItemMouseEnter: (partName: string, evt: React.MouseEvent<HTMLImageElement>) => void;
}

const PartsList = (props: PartsListProps) => {
  const { handleItemClick, handleItemMouseEnter } = props;
  const handleImageClick = useCallback((evt: React.MouseEvent<HTMLImageElement>) => {
    const partName = evt.currentTarget.dataset.name!;
    handleItemClick(partName, evt);
  }, [handleItemClick]);
  const handleImageMouseEnter = useCallback((evt: React.MouseEvent<HTMLImageElement>) => {
    const partName = evt.currentTarget.dataset.name!;
    handleItemMouseEnter(partName, evt);
  }, [handleItemMouseEnter]);

  return (
    <div className={styles.partsList}>
      {props.names.map((name) => (
        <PartsListItem
          key={name}
          name={name}
          onClick={handleImageClick}
          onMouseEnter={handleImageMouseEnter}
        />
      ))}
    </div>
  );
};

export default PartsList;
