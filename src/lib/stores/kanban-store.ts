import { create } from "zustand";
import type { Board, Column, Card } from "@/lib/types/database";

interface KanbanState {
  boards: Board[];
  activeBoardId: string | null;
  columns: Record<string, Column[]>;
  cards: Record<string, Card[]>;
  setBoards: (boards: Board[]) => void;
  setActiveBoard: (boardId: string | null) => void;
  setColumns: (boardId: string, columns: Column[]) => void;
  setCards: (columnId: string, cards: Card[]) => void;
  addCard: (card: Card) => void;
  updateCard: (cardId: string, updates: Partial<Card>) => void;
  moveCard: (cardId: string, fromColumnId: string, toColumnId: string, newPosition: number) => void;
  removeCard: (cardId: string, columnId: string) => void;
}

export const useKanbanStore = create<KanbanState>((set, get) => ({
  boards: [],
  activeBoardId: null,
  columns: {},
  cards: {},
  setBoards: (boards) => set({ boards }),
  setActiveBoard: (boardId) => set({ activeBoardId: boardId }),
  setColumns: (boardId, columns) =>
    set((state) => ({ columns: { ...state.columns, [boardId]: columns } })),
  setCards: (columnId, cards) =>
    set((state) => ({ cards: { ...state.cards, [columnId]: cards } })),
  addCard: (card) =>
    set((state) => ({
      cards: {
        ...state.cards,
        [card.column_id]: [...(state.cards[card.column_id] || []), card],
      },
    })),
  updateCard: (cardId, updates) =>
    set((state) => {
      const newCards = { ...state.cards };
      for (const columnId in newCards) {
        newCards[columnId] = newCards[columnId].map((c) =>
          c.id === cardId ? { ...c, ...updates } : c
        );
      }
      return { cards: newCards };
    }),
  moveCard: (cardId, fromColumnId, toColumnId, newPosition) =>
    set((state) => {
      const fromCards = [...(state.cards[fromColumnId] || [])];
      const cardIndex = fromCards.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) return state;
      const [card] = fromCards.splice(cardIndex, 1);
      const updatedCard = { ...card, column_id: toColumnId, position: newPosition };

      const toCards = fromColumnId === toColumnId
        ? fromCards
        : [...(state.cards[toColumnId] || [])];
      toCards.splice(newPosition, 0, updatedCard);

      return {
        cards: {
          ...state.cards,
          [fromColumnId]: fromColumnId === toColumnId ? toCards : fromCards,
          [toColumnId]: toCards,
        },
      };
    }),
  removeCard: (cardId, columnId) =>
    set((state) => ({
      cards: {
        ...state.cards,
        [columnId]: (state.cards[columnId] || []).filter((c) => c.id !== cardId),
      },
    })),
}));
