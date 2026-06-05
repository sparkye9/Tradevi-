'use client';
import { useEffect, useState } from 'react';

const TRADING_SCRIPTURES = [
  { text: 'Wealth gained hastily will dwindle, but whoever gathers little by little will increase it.', ref: 'Proverbs 13:11' },
  { text: 'Invest in seven ventures, yes, in eight; you do not know what disaster may come upon the land.', ref: 'Ecclesiastes 11:2' },
  { text: 'Where there is no guidance, a people falls, but in an abundance of counselors there is safety.', ref: 'Proverbs 11:14' },
  { text: 'So, whether you eat or drink, or whatever you do, do all to the glory of God.', ref: '1 Corinthians 10:31' },
  { text: 'For to everyone who has will more be given, and he will have an abundance. But from the one who has not, even what he has will be taken away.', ref: 'Matthew 25:29 (Parable of the Talents)' },
  { text: 'For the love of money is a root of all kinds of evil.', ref: '1 Timothy 6:10' },
  { text: 'Better is a little with righteousness than great revenues with injustice.', ref: 'Proverbs 16:8' },
  { text: 'Trust in the LORD with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.', ref: 'Proverbs 3:5-6' },
  { text: 'For which of you, desiring to build a tower, does not first sit down and count the cost, whether he has enough to complete it?', ref: 'Luke 14:28' },
];

const INTERVAL = 8000;

export default function ScriptureRotator() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % TRADING_SCRIPTURES.length);
        setVisible(true);
      }, 400);
    }, INTERVAL);
    return () => clearInterval(iv);
  }, []);

  const { text, ref } = TRADING_SCRIPTURES[index];

  return (
    <div className="border-b border-[#1a1a1a] bg-[#0a0a0a] px-6 py-2 flex items-center gap-3 min-h-[36px]">
      <span className="text-emerald-500/40 text-xs shrink-0">✦</span>
      <p
        className="text-xs text-gray-600 italic flex-1 text-center transition-opacity duration-400"
        style={{ opacity: visible ? 1 : 0 }}
      >
        &ldquo;{text}&rdquo;{' '}
        <span className="not-italic text-gray-700 font-mono">— {ref}</span>
      </p>
      <span className="text-emerald-500/40 text-xs shrink-0">✦</span>
    </div>
  );
}
