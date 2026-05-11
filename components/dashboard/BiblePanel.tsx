'use client';
import { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { BookMarked, RefreshCw } from 'lucide-react';

const content = [
  { type: 'verse', text: '"For which of you, desiring to build a tower, does not first sit down and count the cost?" — Luke 14:28', theme: 'Planning' },
  { type: 'verse', text: '"The plans of the diligent lead surely to abundance, but everyone who is hasty comes only to poverty." — Proverbs 21:5', theme: 'Patience' },
  { type: 'verse', text: '"Be sober-minded; be watchful." — 1 Peter 5:8', theme: 'Discipline' },
  { type: 'verse', text: '"Precious treasure and oil are in a wise man\'s dwelling, but a foolish man devours it." — Proverbs 21:20', theme: 'Preservation' },
  { type: 'verse', text: '"A man who lacks judgment strikes hands in pledge and puts up security for his neighbor." — Proverbs 17:18', theme: 'Risk Management' },
  { type: 'verse', text: '"Where there is no guidance, a people falls, but in an abundance of counselors there is safety." — Proverbs 11:14', theme: 'Wisdom' },
  { type: 'verse', text: '"Trust in the LORD with all your heart and lean not on your own understanding." — Proverbs 3:5', theme: 'Faith' },
  { type: 'verse', text: '"Whoever is slow to anger has great understanding, but he who has a hasty temper exalts folly." — Proverbs 14:29', theme: 'Self-Control' },
  { type: 'affirmation', text: 'I wait for confirmation. I do not chase candles.', theme: 'Discipline' },
  { type: 'affirmation', text: 'Preservation of capital comes first. Gains come second.', theme: 'Risk Management' },
  { type: 'affirmation', text: 'Small consistent wins matter more than one big score.', theme: 'Consistency' },
  { type: 'affirmation', text: 'If I miss the move, I wait for the next one. There is always another setup.', theme: 'Patience' },
  { type: 'affirmation', text: 'I never risk more than I can afford to lose completely on any one trade.', theme: 'Safety' },
  { type: 'affirmation', text: 'FOMO is not a trade setup. Fear is not a stop loss.', theme: 'Mindset' },
  { type: 'affirmation', text: 'My edge is patience, preparation, and process — not prediction.', theme: 'Process' },
  { type: 'affirmation', text: 'I close my trades according to my plan, not my emotions.', theme: 'Discipline' },
  { type: 'affirmation', text: 'Today I trade what I see, not what I feel.', theme: 'Objectivity' },
  { type: 'affirmation', text: 'I am building skills, not just trying to make money fast.', theme: 'Growth' },
];

export function BiblePanel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * content.length));
  }, []);

  const item = content[idx];
  const next = () => setIdx(i => (i + 1) % content.length);

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-white">
      <CardHeader
        title="Bible & Mindset"
        icon={<BookMarked size={16} />}
        action={
          <button onClick={next} className="p-1.5 hover:bg-purple-100 rounded-lg text-purple-400 hover:text-purple-600 transition-colors">
            <RefreshCw size={14} />
          </button>
        }
      />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
            {item.theme}
          </span>
          <span className="text-xs text-gray-400 capitalize">{item.type}</span>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed italic">
          "{item.text.replace(/^"|"$/g, '')}"
        </p>
      </div>
    </Card>
  );
}
