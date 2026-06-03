export interface Note {
  id: string;
  title: string;
  pinned?: boolean;
}

export function pinNote(note: Note): Note {
  return { ...note, pinned: true };
}

export function unpinNote(note: Note): Note {
  return { ...note, pinned: false };
}
