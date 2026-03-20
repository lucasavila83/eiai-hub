"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { getInitials, generateColor } from "@/lib/utils/helpers";

interface Member {
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string;
  };
}

interface Props {
  members: Member[];
  search: string;
  onSelect: (member: Member) => void;
  onClose: () => void;
}

export function MentionAutocomplete({ members, search, onSelect, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = members
    .filter((m) => {
      const query = search.toLowerCase();
      const name = (m.profiles.full_name ?? "").toLowerCase();
      const email = m.profiles.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    })
    .slice(0, 5);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev <= 0 ? Math.max(filtered.length - 1, 0) : prev - 1
        );
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, activeIndex, onSelect, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      ref={listRef}
      className="absolute bottom-full mb-2 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-72 overflow-hidden"
    >
      <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">
        Membros
      </div>

      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-gray-400">
          Nenhum membro encontrado
        </div>
      ) : (
        filtered.map((member, index) => {
          const name = member.profiles.full_name ?? member.profiles.email;
          const initials = getInitials(name);
          const color = generateColor(name);

          return (
            <button
              key={member.user_id}
              onClick={() => onSelect(member)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                index === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"
              }`}
            >
              {/* Avatar */}
              {member.profiles.avatar_url ? (
                <Image
                  src={member.profiles.avatar_url}
                  alt={name}
                  width={32}
                  height={32}
                  className="rounded-full shrink-0"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {member.profiles.full_name ?? "Sem nome"}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {member.profiles.email}
                </p>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
