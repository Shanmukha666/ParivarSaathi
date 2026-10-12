import { useState } from 'react';
import { useStore } from '../lib/store';

const interestLabels: Record<string, Record<string, string>> = {
  te: { tech: 'సాంకేతికం', health: 'ఆరోగ్యం', build: 'నిర్మాణం', art: 'కళ', food: 'ఆహారం', auto: 'ఆటోమొబైల్' },
  hi: { tech: 'तकनीक', health: 'स्वास्थ्य', build: 'निर्माण', art: 'कला', food: 'खाद्य', auto: 'ऑटो' },
  ta: { tech: 'தொழில்நுட்பம்', health: 'ஆரோக்கியம்', build: 'கட்டுமானம்', art: 'கலை', food: 'உணவு', auto: 'ஆட்டோமொபைல்' },
};

const icons = [
  { id: 'tech', label: 'Tech', icon: '💻' },
  { id: 'health', label: 'Health', icon: '🏥' },
  { id: 'build', label: 'Build', icon: '🏗️' },
  { id: 'art', label: 'Art', icon: '🎨' },
  { id: 'food', label: 'Food', icon: '🍳' },
  { id: 'auto', label: 'Auto', icon: '🚗' },
];

export default function IconPicker({ selected, onChange }: { selected: string[], onChange: (val: string[]) => void }) {
  const { language } = useStore();
  const labelFor = (id: string, fallback: string) => interestLabels[language]?.[id] || fallback;
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      {icons.map(item => {
        const isSelected = selected.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
              isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'
            }`}
          >
            <span className="text-4xl mb-2">{item.icon}</span>
            <span className={`text-sm font-medium ${isSelected ? 'text-orange-700' : 'text-gray-600'}`}>
              {labelFor(item.id, item.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
