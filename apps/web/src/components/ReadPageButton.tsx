'use client';

import { Volume2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { speakText } from '../lib/speech';

// One-tap "read this screen aloud" for low-literacy users. Reads the visible page text in the chosen language.
export default function ReadPageButton() {
  const { language } = useStore();
  const read = () => {
    const root = document.querySelector('main') as HTMLElement | null;
    const text = root?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 900);
    if (text) speakText(text, language);
  };
  return (
    <button type="button" onClick={read} aria-label="Read this screen aloud"
      className="h-11 w-11 shrink-0 rounded-full bg-orange-50 border border-orange-200 text-orange-700 flex items-center justify-center">
      <Volume2 size={20} />
    </button>
  );
}
