"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const CATEGORIES = [
  {
    key: "recentes",
    label: "Recentes",
    icon: "🕐",
    emojis: [] as string[],
  },
  {
    key: "rostos",
    label: "Rostos",
    icon: "😀",
    emojis: [
      "😀","😃","😄","😁","😅","😂","🤣","😊","😇","🙂",
      "😉","😌","😍","🥰","😘","😗","😋","😛","😜","🤪",
      "😎","🤩","🥳","😏","😒","😔","😞","😢","😭","😤",
      "😡","🤔","🤗","🤫","🤭","😱","😨","😰","🥺","😳",
    ],
  },
  {
    key: "gestos",
    label: "Gestos",
    icon: "👍",
    emojis: [
      "👍","👎","👏","🙌","🤝","✌️","🤞","👌","🤙","💪",
      "🙏","❤️","🔥","⭐","💯","✅","❌","⚡","🎉","🎊",
    ],
  },
  {
    key: "objetos",
    label: "Objetos",
    icon: "💼",
    emojis: [
      "📋","📌","📎","📝","💼","📊","📈","💡","🔔","🔑",
      "🏠","💻","📱","📧","🗂️","📁","🔍","🗓️","⏰","🔒",
    ],
  },
  {
    key: "natureza",
    label: "Natureza",
    icon: "🌿",
    emojis: [
      "🌟","🌈","☀️","🌙","⭐","🔥","💧","🌊","🌸","🌺",
      "🌻","🍀","🌿","🌴","🌵","🌾","🍂","❄️",
    ],
  },
  {
    key: "comida",
    label: "Comida",
    icon: "☕",
    emojis: [
      "☕","🍕","🍔","🎂","🍰","🍩","🍪","🧁","🍎","🍓",
      "🥑","🍺","🥤","🍫","🍿","🥐","🍜","🥗",
    ],
  },
];

const RECENT_STORAGE_KEY = "emoji-picker-recents";
const MAX_RECENTS = 20;

function getRecentEmojis(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentEmoji(emoji: string) {
  try {
    const recents = getRecentEmojis().filter((e) => e !== emoji);
    recents.unshift(emoji);
    localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify(recents.slice(0, MAX_RECENTS))
    );
  } catch {
    // ignore storage errors
  }
}

export function EmojiPicker({ onSelect, onClose }: Props) {
  const [activeCategory, setActiveCategory] = useState("rostos");
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(getRecentEmojis());
    searchRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSelect(emoji: string) {
    saveRecentEmoji(emoji);
    onSelect(emoji);
    onClose();
  }

  // Build categories with recents populated
  const categories = CATEGORIES.map((cat) =>
    cat.key === "recentes" ? { ...cat, emojis: recents } : cat
  );

  // Filter emojis by search
  const allEmojis = CATEGORIES.flatMap((c) => c.emojis);
  const filteredEmojis = search.trim()
    ? allEmojis.filter((e) => e.includes(search))
    : null;

  const activeEmojis = filteredEmojis
    ?? categories.find((c) => c.key === activeCategory)?.emojis
    ?? [];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full mb-2 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg max-w-xs w-72"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar emoji..."
            className="bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none w-full"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category tabs */}
      {!filteredEmojis && (
        <div className="flex items-center gap-0.5 px-2 pb-1 border-b border-gray-100">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`p-1.5 rounded-lg text-sm transition-colors ${
                activeCategory === cat.key
                  ? "bg-gray-100"
                  : "hover:bg-gray-50"
              }`}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="px-2 py-2 max-h-48 overflow-y-auto">
        {!filteredEmojis && (
          <p className="text-xs text-gray-400 font-medium px-1 mb-1">
            {categories.find((c) => c.key === activeCategory)?.label}
          </p>
        )}
        {filteredEmojis && (
          <p className="text-xs text-gray-400 font-medium px-1 mb-1">
            Resultados
          </p>
        )}
        {activeEmojis.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            {activeCategory === "recentes"
              ? "Nenhum emoji recente"
              : "Nenhum emoji encontrado"}
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {activeEmojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => handleSelect(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-lg hover:bg-gray-100 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
