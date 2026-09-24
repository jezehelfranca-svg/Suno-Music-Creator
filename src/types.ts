export type GenreCategory = 
  | 'All'
  | 'Rock & Metal'
  | 'Electronic & Dance'
  | 'Hip-Hop & Urban'
  | 'Jazz & Blues'
  | 'Pop & Vocal'
  | 'World & Traditional'
  | 'Coined Fusion'
  | 'Instrument Showcases';

export interface GenreItem {
  name: string;
  isCoined: boolean;
  category: GenreCategory;
}

export interface PromptMeta {
  timeSig: string;
  bpm: number | null;
  key: string | null;
}

export interface StyleCollection {
  id: string;
  name: string;
  note: string;
  category?: GenreCategory;
  prompts: string[];
}

export interface VariationOptions {
  rhythm: boolean;
  harmony: boolean;
  production: boolean;
  instruments: boolean;
  structure: boolean;
  vocals: boolean;
  mood: boolean;
  scene: boolean;
  usecase: boolean;
  key: boolean;
  title: boolean;
  highlight: boolean;
}

export type SunoPromptFormat = 'suno-tag' | 'full-prompt' | 'complete-bundle';

export interface GeneratedPrompt {
  id: string;
  title: string;
  genres: string[];
  timeSig: string;
  minBpm: number;
  maxBpm: number;
  bitrate: string;
  key: string;
  fullPrompt: string;
  sunoStyleTag: string;
  selectedInstruments?: string[];
  lyricSnippet?: string;
  structureTags?: string[];
  excludeStyles?: string;
  vocalGender?: 'Male' | 'Female' | 'Duet' | 'None';
  duration?: string;
  weirdness?: number;
  styleInfluence?: number;
  variety?: 'Low' | 'Medium' | 'High';
  maxMode?: boolean;
  isInstrumental?: boolean;
  createdAt: number;
  isFavorite?: boolean;
}

export interface CustomTemplateState {
  genre1?: string;
  genre2?: string;
  genre3?: string;
  timeSig?: string;
  bpm?: number;
  minBpm?: number;
  maxBpm?: number;
  instruments?: string[];
  excludeStyles?: string;
  vocalGender?: 'Male' | 'Female' | 'Duet' | 'None';
  duration?: string;
  weirdness?: number;
  styleInfluence?: number;
  variety?: 'Low' | 'Medium' | 'High';
  maxMode?: boolean;
  isInstrumental?: boolean;
  restoredPrompt?: GeneratedPrompt;
}
