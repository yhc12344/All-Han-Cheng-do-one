import { RefObject, useEffect } from "react";

interface ResizableChart {
  resize: () => void;
}

const resizeRegistry = new Map<Element, ResizableChart>();

const sharedObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    resizeRegistry.get(entry.target)?.resize();
  }
});

export function useChartResize(
  containerRef: RefObject<HTMLElement | null>,
  chartRef: RefObject<ResizableChart | null> | ResizableChart
) {
  useEffect(() => {
    const el = containerRef.current;
    const chart = chartRef && "current" in chartRef ? chartRef.current : chartRef;
    if (!el || !chart) return;
    
    resizeRegistry.set(el, chart);
    sharedObserver.observe(el);
    
    return () => {
      resizeRegistry.delete(el);
      sharedObserver.unobserve(el);
    };
  }, [containerRef, chartRef]);
}
