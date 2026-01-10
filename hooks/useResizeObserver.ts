import { useEffect, useState, RefObject } from 'react';
import { CanvasSize } from '../types';

export const useResizeObserver = (ref: RefObject<HTMLElement>): CanvasSize => {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      
      // Use contentRect for precise content box dimensions
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return size;
};
