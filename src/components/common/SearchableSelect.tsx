import { useState, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export interface SearchableSelectOption {
  id: number;
  label: string;
}

interface SearchableSelectProps {
  value: number;
  onChange: (id: number) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  className?: string;
  /** Id for the text input, so an external <label for> can name it. */
  id?: string;
  /** Accessible name when there is no visible <label for={id}>. */
  ariaLabel?: string;
}

// A combobox: type to filter, arrow keys to move, Enter to choose, Escape to
// close. Screen readers get the combobox/listbox roles and the highlighted
// option through aria-activedescendant.
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search...",
  className = "",
  id,
  ariaLabel,
}: SearchableSelectProps) {
  const selectedLabel = options.find((opt) => opt.id === value)?.label || "";
  const [searchTerm, setSearchTerm] = useState(selectedLabel);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Keep the displayed text in sync with the selected option whenever it
  // changes externally (row initialized, options finish loading, etc).
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm(selectedLabel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLabel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm(selectedLabel);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedLabel]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSelect = (option: SearchableSelectOption) => {
    onChange(option.id);
    setSearchTerm(option.label);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleClear = () => {
    onChange(0);
    setSearchTerm("");
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) =>
        filteredOptions.length === 0 ? -1 : (i + 1) % filteredOptions.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) =>
        filteredOptions.length === 0
          ? -1
          : (i - 1 + filteredOptions.length) % filteredOptions.length,
      );
    } else if (event.key === "Enter") {
      if (isOpen && activeIndex >= 0 && filteredOptions[activeIndex]) {
        event.preventDefault();
        handleSelect(filteredOptions[activeIndex]);
      }
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setSearchTerm(selectedLabel);
      setActiveIndex(-1);
    }
  };

  const showList = isOpen && filteredOptions.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-activedescendant={
            showList && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          autoComplete="off"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
            if (value) onChange(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-11 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-700 sm:min-h-10 sm:text-sm"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear selection"
            className="absolute right-0.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        hidden={!showList}
        className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-300 bg-white shadow-md"
      >
        {filteredOptions.map((option, index) => (
          <li
            key={option.id}
            id={optionId(index)}
            role="option"
            aria-selected={value === option.id}
            onClick={() => handleSelect(option)}
            onMouseEnter={() => setActiveIndex(index)}
            className={`min-h-11 cursor-pointer px-3 py-2.5 text-sm font-medium text-slate-900 sm:min-h-0 sm:py-2 ${
              activeIndex === index
                ? "bg-blue-100"
                : value === option.id
                  ? "bg-slate-100"
                  : ""
            }`}
          >
            {option.label}
          </li>
        ))}
      </ul>

      {isOpen && searchTerm && filteredOptions.length === 0 && (
        <div
          role="status"
          className="absolute z-10 mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 shadow-md"
        >
          No matches found
        </div>
      )}
    </div>
  );
}
