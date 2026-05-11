'use client';
import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BookMarked, Heart, Zap, Shield, Target, Star } from 'lucide-react';

const VERSES = [
  { text: '"For which of you, desiring to build a tower, does not first sit down and count the cost, whether he has enough to complete it?"', ref: 'Luke 14:28', theme: 'Planning', icon: '🏗️' },
  { text: '"The plans of the diligent lead surely to abundance, but everyone who is hasty comes only to poverty."', ref: 'Proverbs 21:5', theme: 'Patience', icon: '⏳' },
  { text: '"Be sober-minded; be watchful. Your adversary the devil prowls around like a roaring lion, seeking someone to devour."', ref: '1 Peter 5:8', theme: 'Discipline', icon: '👁️' },
  { text: '"Precious treasure and oil are in a wise man\'s dwelling, but a foolish man devours it."', ref: 'Proverbs 21:20', theme: 'Preservation', icon: '💎' },
  { text: '"A man who lacks judgment strikes hands in pledge and puts up security for his neighbor."', ref: 'Proverbs 17:18', theme: 'Risk', icon: '⚠️' },
  { text: '"Where there is no guidance, a people falls, but in an abundance of counselors there is safety."', ref: 'Proverbs 11:14', theme: 'Wisdom', icon: '🧭' },
  { text: '"Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight."', ref: 'Proverbs 3:5–6', theme: 'Faith', icon: '🙏' },
  { text: '"Whoever is slow to anger has great understanding, but he who has a hasty temper exalts folly."', ref: 'Proverbs 14:29', theme: 'Self-Control', icon: '🧘' },
  { text: '"Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God."', ref: 'Philippians 4:6', theme: 'Peace', icon: '☮️' },
  { text: '"Commit your work to the LORD, and your plans will be established."', ref: 'Proverbs 16:3', theme: 'Purpose', icon: '🎯' },
  { text: '"A good man leaves an inheritance to his children\'s children, but the sinner\'s wealth is laid up for the righteous."', ref: 'Proverbs 13:22', theme: 'Legacy', icon: '👨‍👧' },
  { text: '"The rich rules over the poor, and the borrower is the slave of the lender."', ref: 'Proverbs 22:7', theme: 'Debt', icon: '💳' },
  { text: '"Dishonest money dwindles away, but whoever gathers money little by little makes it grow."', ref: 'Proverbs 13:11', theme: 'Consistency', icon: '📈' },
  { text: '"In everything I did, I showed you that by this kind of hard work we must help the weak, remembering the words the Lord Jesus himself said: \'It is more blessed to give than to receive.\'"', ref: 'Acts 20:35', theme: 'Generosity', icon: '🎁' },
];

const AFFIRMATIONS = [
  { text: 'I wait for confirmation. I do not chase candles.', category: 'Discipline' },
  { text: 'Preservation of capital comes first. Gains come second.', category: 'Risk Management' },
  { text: 'Small consistent wins matter more than one big score.', category: 'Consistency' },
  { text: 'If I miss the move, I wait for the next one. There is always another setup.', category: 'Patience' },
  { text: 'I never risk more than I can afford to lose completely on any one trade.', category: 'Safety' },
  { text: 'FOMO is not a trade setup. Fear is not a stop loss.', category: 'Mindset' },
  { text: 'My edge is patience, preparation, and process — not prediction.', category: 'Process' },
  { text: 'I close my trades according to my plan, not my emotions.', category: 'Discipline' },
  { text: 'Today I trade what I see, not what I feel.', category: 'Objectivity' },
  { text: 'I am building skills, not just trying to make money fast.', category: 'Growth' },
  { text: 'A stopped trade is not a failure — it is discipline in action.', category: 'Acceptance' },
  { text: 'I review my trades to improve, not to punish myself.', category: 'Learning' },
  { text: 'The market will always be here tomorrow. Protect capital today.', category: 'Longevity' },
  { text: 'One good setup executed well beats ten rushed trades.', category: 'Quality' },
  { text: 'I am grateful for the opportunity to learn and grow through trading.', category: 'Gratitude' },
];

const THEMES = ['All', 'Planning', 'Patience', 'Discipline', 'Risk', 'Faith', 'Wisdom', 'Consistency', 'Mindset'];

export default function BiblePage() {
  const [activeTab, setActiveTab] = useState<'verses' | 'affirmations'>('verses');
  const [selectedTheme, setSelectedTheme] = useState('All');
  const [favorited, setFavorited] = useState<string[]>([]);

  const toggleFav = (text: string) => setFavorited(f => f.includes(text) ? f.filter(t => t !== text) : [...f, text]);

  const filteredVerses = VERSES.filter(v => selectedTheme === 'All' || v.theme === selectedTheme);

  return (
    <AppShell title="Bible & Mindset">
      {/* Tabs */}
      <div className="flex gap-3 mb-6">
        {(['verses', 'affirmations'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium border capitalize transition-colors ${
              activeTab === tab ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
            }`}
          >
            {tab === 'verses' ? '📖 Bible Verses' : '💪 Affirmations'}
          </button>
        ))}
      </div>

      {activeTab === 'verses' && (
        <>
          {/* Theme filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            {THEMES.map(t => (
              <button
                key={t}
                onClick={() => setSelectedTheme(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedTheme === t ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVerses.map((v, i) => (
              <Card key={i} className="bg-gradient-to-br from-purple-50/50 to-white">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{v.icon}</span>
                    <Badge variant="purple" size="sm">{v.theme}</Badge>
                  </div>
                  <button onClick={() => toggleFav(v.text)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Heart size={16} className={favorited.includes(v.text) ? 'fill-red-500 text-red-500' : ''} />
                  </button>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed italic mb-2">{v.text}</p>
                <p className="text-xs text-purple-600 font-medium">{v.ref}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {activeTab === 'affirmations' && (
        <>
          <p className="text-sm text-gray-500 mb-6">Read these before every trading session. Internalize them. Let them guide your decisions.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AFFIRMATIONS.map((a, i) => (
              <Card key={i} className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Badge variant="purple" size="sm" className="mb-2">{a.category}</Badge>
                    <p className="text-base font-medium text-gray-800 leading-relaxed">{a.text}</p>
                  </div>
                  <button onClick={() => toggleFav(a.text)} className="ml-3 text-gray-300 hover:text-red-500 transition-colors">
                    <Heart size={16} className={favorited.includes(a.text) ? 'fill-red-500 text-red-500' : ''} />
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {favorited.length > 0 && (
            <Card className="mt-6 border-yellow-200 bg-yellow-50">
              <CardHeader title="⭐ My Favorites" subtitle={`${favorited.length} saved`} />
              <div className="space-y-3">
                {favorited.map((text, i) => (
                  <p key={i} className="text-sm text-gray-700 italic border-l-2 border-yellow-400 pl-3">{text}</p>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
