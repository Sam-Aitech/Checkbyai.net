import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Shared open/close logic for hover-driven nav dropdowns. The wrapper (not
 * the trigger or menu individually) owns hover state, since mouseenter/
 * mouseleave bubble from any DOM descendant up to the wrapper — that's what
 * lets the pointer travel through the visual gap between trigger and menu
 * without the menu closing early.
 */
export function useHoverDropdown<TTrigger extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<TTrigger>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }, []);

  const wrapperHandlers = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onKeyDown,
  };

  return { open, setOpen, wrapperRef, triggerRef, wrapperHandlers };
}
