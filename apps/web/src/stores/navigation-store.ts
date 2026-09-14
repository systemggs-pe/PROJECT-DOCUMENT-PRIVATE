import { create } from "zustand";

export type NavigationSection = "dashboard" | "templates" | "generate" | "files" | "generations" | "organizations" | "organization" | "users" | "roles" | "audit" | "settings";

interface NavigationState {
  currentSection: NavigationSection;
  setCurrentSection: (section: NavigationSection) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentSection: "dashboard",
  setCurrentSection: (section) => set({ currentSection: section }),
}));
