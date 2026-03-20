"use client";

import { MessageSquare } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-1">Selecione um canal</h2>
        <p className="text-muted-foreground text-sm">Escolha um canal na sidebar para começar a conversar</p>
      </div>
    </div>
  );
}
