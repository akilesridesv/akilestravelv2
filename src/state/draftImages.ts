import { create } from "zustand";

// Bridge so the chat composer's "add images" button can push uploaded image
// refs into the experience draft editor that's currently open in the chat.
interface DraftImagesState {
  pending: string[];
  add: (refs: string[]) => void;
  consume: () => string[];
}

export const useDraftImages = create<DraftImagesState>((set, get) => ({
  pending: [],
  add: (refs) => set({ pending: [...get().pending, ...refs] }),
  consume: () => {
    const refs = get().pending;
    if (refs.length) set({ pending: [] });
    return refs;
  },
}));
