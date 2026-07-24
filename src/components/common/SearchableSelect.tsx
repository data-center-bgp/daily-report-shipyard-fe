import { useState, useEffect, useRef } from "react";
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
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search...",
  className = "",
}: SearchableSelectProps) {
  const selectedLabel = options.find((opt) => opt.id === value)?.label || "";
  const [searchTerm, setSearchTerm] = useState(selectedLabel);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
  };

  const handleClear = () => {
    onChange(0);
    setSearchTerm("");
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (value) onChange(0);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.map((option) => (
            <div
              key={option.id}
              onClick={() => handleSelect(option)}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                value === option.id ? "bg-blue-100" : ""
              }`}
            >
              <div className="font-medium text-gray-900 text-sm">
                {option.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && searchTerm && filteredOptions.length === 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-500">
          No matches found
        </div>
      )}
    </div>
  );
}
