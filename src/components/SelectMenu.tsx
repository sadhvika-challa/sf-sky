import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SelectMenuProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  plain?: boolean;
  menuMinWidth?: number;
}

export default function SelectMenu<T extends string>({ label, value, options, onChange, plain = false, menuMinWidth = 140 }: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const height = options.length * 44 + 8;
      const width = Math.min(Math.max(box.width, menuMinWidth), window.innerWidth - 24);
      setPosition({
        top: box.bottom + height + 8 <= bottom ? box.bottom + 4 : Math.max(12, box.top - height - 4),
        left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)),
        width,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open, options.length, menuMinWidth]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? id : undefined}
      aria-activedescendant={open ? `${id}-${activeIndex}` : undefined}
      onClick={() => { setActiveIndex(selectedIndex); setOpen(!open); }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); return; }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (open) choose(activeIndex);
          else { setActiveIndex(selectedIndex); setOpen(true); }
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
            : open ? Math.max(0, Math.min(options.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))) : selectedIndex;
          setActiveIndex(index);
          setOpen(true);
        }
      }}
      className={`inline-flex min-h-11 flex-shrink-0 items-center gap-2 rounded-lg font-mono text-[13px] text-[#173D43] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155561] ${plain ? 'bg-transparent px-0 font-medium' : 'min-w-[100px] border border-cream-dark bg-white px-3'}`}>
      <span>{options[selectedIndex].label}</span>
      <svg className="-rotate-90" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    </button>
    {open && createPortal(<div ref={popup} id={id} role="listbox" aria-label={label}
      className="fixed z-[1100] rounded-xl border border-gray-200 bg-white p-1 font-mono text-[13px] text-[#173D43] shadow-lg"
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
      {options.map((option, index) => <button key={option.value} id={`${id}-${index}`} type="button" role="option"
        aria-selected={option.value === value} tabIndex={-1} onPointerDown={(event) => event.preventDefault()}
        onPointerMove={() => setActiveIndex(index)} onClick={() => choose(index)}
        className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left ${index === activeIndex ? 'bg-[#DEF1E8]' : 'hover:bg-gray-50'} ${option.value === value ? 'font-medium' : ''}`}>
        {option.label}
      </button>)}
    </div>, document.body)}
  </>;
}
