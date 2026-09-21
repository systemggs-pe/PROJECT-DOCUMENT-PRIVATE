import type { NavigationSection } from "@/stores/navigation-store";

export const sectionOrder: NavigationSection[] = [
  "dashboard",
  "generate",
  "generations",
  "templates",
  "files",
  "fileFields",
  "owner",
  "users",
  "roles",
  "audit",
  "support",
  "settings",
];

export const mobilePrimarySections: NavigationSection[] = [
  "dashboard",
  "generate",
  "generations",
  "files",
];

export const mobileSectionLabels: Partial<Record<NavigationSection, string>> = {
  dashboard: "Inicio",
  generate: "Generar",
  generations: "Docs",
  templates: "Plantillas",
  files: "Archivos",
  fileFields: "Campos",
  owner: "Titular",
  users: "Usuarios",
  roles: "Roles",
  audit: "Audit",
  support: "Soporte",
  settings: "Ajustes",
};

export function pathForSection(section: NavigationSection) {
  if (section === "templates") return "/templates";
  if (section === "generate") return "/generate";
  if (section === "fileFields") return "/file-fields";
  if (section === "files") return "/files";
  if (section === "generations") return "/generations";
  if (section === "owner") return "/owner";
  if (section === "users") return "/users";
  if (section === "roles") return "/roles";
  if (section === "audit") return "/audit";
  if (section === "support") return "/support";
  if (section === "settings") return "/settings";
  return "/";
}

export function navigateToSection(section: NavigationSection) {
  const path = pathForSection(section);
  if (window.location.pathname !== path) window.history.pushState(null, "", path);
}
