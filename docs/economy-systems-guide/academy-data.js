/* Trilhas editoriais da Academy. Os IDs apontam para sistemas do catálogo principal. */
window.NEON_ACADEMY_TRACKS = [
  {
    id: "foundation",
    title: "Fundamentos de sistemas",
    icon: "blocks",
    level: "Básico",
    description: "Aprenda estado, configuração, eventos e limites antes de construir economia.",
    systems: ["notification", "cooldown", "player-session", "attribute-sync", "tag", "settings", "interaction"]
  },
  {
    id: "economy",
    title: "Economia segura",
    icon: "landmark",
    level: "Intermediário",
    description: "Modele saldo, preço, transação, recibo e auditoria sem duplicar valor.",
    systems: ["currency-exchange", "price", "transaction", "receipt-processing", "economy-audit", "refund", "wallet-history"]
  },
  {
    id: "progression",
    title: "Progressão e retenção",
    icon: "chart-no-axes-combined",
    level: "Intermediário",
    description: "Conecte missões, recompensas, níveis e prestígio em uma progressão legível.",
    systems: ["tutorial", "quest", "reward", "daily-reward", "leveling", "skill-tree", "prestige-tier"]
  },
  {
    id: "persistence",
    title: "Dados e produção",
    icon: "database-backup",
    level: "Avançado",
    description: "Proteja perfis com sessão, migração, autosave, retry, backup e rollback.",
    systems: ["player-session", "session-lock", "migration", "autosave", "retry-policy", "backup-snapshot", "rollback"]
  },
  {
    id: "security",
    title: "Rede e segurança",
    icon: "shield-check",
    level: "Avançado",
    description: "Valide intenção remota, imponha limites e observe abuso no servidor.",
    systems: ["remote-gateway", "rate-limit", "anti-exploit", "moderation", "admin-command", "performance-budget"]
  },
  {
    id: "liveops",
    title: "Lançamento e Live Ops",
    icon: "radio-tower",
    level: "Avançado",
    description: "Publique por etapas, acompanhe comportamento e reverta mudanças com segurança.",
    systems: ["analytics", "feature-rollout", "live-ops", "patch-notes", "server-shutdown", "cross-server-messaging"]
  }
];
