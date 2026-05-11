'use client';
import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BookMarked, Heart, RefreshCw } from 'lucide-react';

// ── Real King James / NIV Bible verses on money, wealth, faith & stewarding ──
const VERSES = [
  // Money & Wealth
  { text: 'For the love of money is a root of all kinds of evil. Some people, eager for money, have wandered from the faith and pierced themselves with many griefs.', ref: '1 Timothy 6:10 (NIV)', theme: 'Money', icon: '💰' },
  { text: 'No one can serve two masters. Either you will hate the one and love the other, or you will be devoted to the one and despise the other. You cannot serve both God and money.', ref: 'Matthew 6:24 (NIV)', theme: 'Priorities', icon: '⚖️' },
  { text: 'Dishonest money dwindles away, but whoever gathers money little by little makes it grow.', ref: 'Proverbs 13:11 (NIV)', theme: 'Consistency', icon: '📈' },
  { text: 'Whoever loves money never has enough; whoever loves wealth is never satisfied with their income. This too is meaningless.', ref: 'Ecclesiastes 5:10 (NIV)', theme: 'Contentment', icon: '🧘' },
  { text: 'A good man leaves an inheritance to his children\'s children, but the sinner\'s wealth is laid up for the righteous.', ref: 'Proverbs 13:22 (ESV)', theme: 'Legacy', icon: '👨‍👧' },
  { text: 'Wealth gained hastily will dwindle, but whoever gathers little by little will increase it.', ref: 'Proverbs 13:11 (ESV)', theme: 'Patience', icon: '⏳' },
  { text: 'The rich rules over the poor, and the borrower is the slave of the lender.', ref: 'Proverbs 22:7 (ESV)', theme: 'Debt', icon: '⛓️' },
  { text: 'Do not toil to acquire wealth; be discerning enough to desist. When your eyes light on it, it is gone, for suddenly it sprouts wings, flying like an eagle toward heaven.', ref: 'Proverbs 23:4–5 (ESV)', theme: 'Humility', icon: '🦅' },
  { text: 'Better is a little with righteousness than great revenues with injustice.', ref: 'Proverbs 16:8 (ESV)', theme: 'Integrity', icon: '⚖️' },
  { text: 'Cast but a glance at riches, and they are gone, for they will surely sprout wings and fly off to the sky like an eagle.', ref: 'Proverbs 23:5 (NIV)', theme: 'Humility', icon: '🌬️' },

  // Stewardship
  { text: 'His master replied, "Well done, good and faithful servant! You have been faithful with a few things; I will put you in charge of many things. Come and share your master\'s happiness!"', ref: 'Matthew 25:23 (NIV)', theme: 'Stewardship', icon: '🌱' },
  { text: 'Whoever can be trusted with very little can also be trusted with much, and whoever is dishonest with very little will also be dishonest with much.', ref: 'Luke 16:10 (NIV)', theme: 'Stewardship', icon: '🔑' },
  { text: 'From everyone who has been given much, much will be demanded; and from the one who has been entrusted with much, much more will be asked.', ref: 'Luke 12:48 (NIV)', theme: 'Stewardship', icon: '📋' },
  { text: 'Now it is required that those who have been given a trust must prove faithful.', ref: '1 Corinthians 4:2 (NIV)', theme: 'Stewardship', icon: '🏛️' },
  { text: 'The earth is the LORD\'s, and everything in it, the world, and all who live in it.', ref: 'Psalm 24:1 (NIV)', theme: 'Stewardship', icon: '🌍' },
  { text: 'Honor the LORD with your wealth, with the firstfruits of all your crops; then your barns will be filled to overflowing, and your vats will brim over with new wine.', ref: 'Proverbs 3:9–10 (NIV)', theme: 'Stewardship', icon: '🌾' },
  { text: 'Bring the whole tithe into the storehouse, that there may be food in my house. Test me in this," says the LORD Almighty, "and see if I will not throw open the floodgates of heaven and pour out so much blessing that there will not be room enough to store it.', ref: 'Malachi 3:10 (NIV)', theme: 'Giving', icon: '🎁' },
  { text: 'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.', ref: '2 Corinthians 9:7 (NIV)', theme: 'Giving', icon: '❤️' },

  // Planning & Wisdom
  { text: 'For which of you, desiring to build a tower, does not first sit down and count the cost, whether he has enough to complete it?', ref: 'Luke 14:28 (ESV)', theme: 'Planning', icon: '🏗️' },
  { text: 'The plans of the diligent lead surely to abundance, but everyone who is hasty comes only to poverty.', ref: 'Proverbs 21:5 (ESV)', theme: 'Patience', icon: '⏳' },
  { text: 'Precious treasure and oil are in a wise man\'s dwelling, but a foolish man devours it.', ref: 'Proverbs 21:20 (ESV)', theme: 'Preservation', icon: '💎' },
  { text: 'Where there is no guidance, a people falls, but in an abundance of counselors there is safety.', ref: 'Proverbs 11:14 (ESV)', theme: 'Wisdom', icon: '🧭' },
  { text: 'Commit your work to the LORD, and your plans will be established.', ref: 'Proverbs 16:3 (ESV)', theme: 'Purpose', icon: '🎯' },
  { text: 'Trust in the LORD with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.', ref: 'Proverbs 3:5–6 (ESV)', theme: 'Faith', icon: '🙏' },
  { text: 'A man who lacks judgment strikes hands in pledge and puts up security for his neighbor.', ref: 'Proverbs 17:18 (NIV)', theme: 'Risk', icon: '⚠️' },
  { text: 'The wise store up choice food and olive oil, but fools gulp theirs down.', ref: 'Proverbs 21:20 (NIV)', theme: 'Preservation', icon: '🫙' },

  // Contentment & Trust
  { text: 'Keep your life free from love of money, and be content with what you have, for he has said, "I will never leave you nor forsake you."', ref: 'Hebrews 13:5 (ESV)', theme: 'Contentment', icon: '☮️' },
  { text: 'I have learned, in whatever state I am, to be content. I know how to be brought low, and I know how to abound. In any and every circumstance, I have learned the secret of facing plenty and hunger, abundance and need.', ref: 'Philippians 4:11–12 (ESV)', theme: 'Contentment', icon: '🕊️' },
  { text: 'But godliness with contentment is great gain, for we brought nothing into the world, and we cannot take anything out of the world.', ref: '1 Timothy 6:6–7 (ESV)', theme: 'Contentment', icon: '🌿' },
  { text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus.', ref: 'Philippians 4:6–7 (NIV)', theme: 'Peace', icon: '✝️' },

  // Discipline & Self-Control
  { text: 'Be sober-minded; be watchful. Your adversary the devil prowls around like a roaring lion, seeking someone to devour.', ref: '1 Peter 5:8 (ESV)', theme: 'Discipline', icon: '🦁' },
  { text: 'Whoever is slow to anger has great understanding, but he who has a hasty temper exalts folly.', ref: 'Proverbs 14:29 (ESV)', theme: 'Self-Control', icon: '🧘' },
  { text: 'Like a city whose walls are broken through is a person who lacks self-control.', ref: 'Proverbs 25:28 (NIV)', theme: 'Self-Control', icon: '🏰' },
  { text: 'The hand of the diligent will rule, while the slothful will be put to forced labor.', ref: 'Proverbs 12:24 (ESV)', theme: 'Diligence', icon: '💪' },
  { text: 'Lazy hands make for poverty, but diligent hands bring wealth.', ref: 'Proverbs 10:4 (NIV)', theme: 'Diligence', icon: '🛠️' },
  { text: 'Go to the ant, O sluggard; consider her ways, and be wise. Without having any chief, officer, or ruler, she prepares her bread in summer and gathers her food in harvest.', ref: 'Proverbs 6:6–8 (ESV)', theme: 'Diligence', icon: '🐜' },

  // Faith & Providence
  { text: 'And my God will supply every need of yours according to his riches in glory in Christ Jesus.', ref: 'Philippians 4:19 (ESV)', theme: 'Providence', icon: '🌟' },
  { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1 (ESV)', theme: 'Providence', icon: '🐑' },
  { text: 'For I know the plans I have for you, declares the LORD, plans for welfare and not for evil, to give you a future and a hope.', ref: 'Jeremiah 29:11 (ESV)', theme: 'Faith', icon: '📖' },
  { text: 'But seek first the kingdom of God and his righteousness, and all these things will be added to you.', ref: 'Matthew 6:33 (ESV)', theme: 'Priorities', icon: '👑' },
  { text: 'I can do all things through him who strengthens me.', ref: 'Philippians 4:13 (ESV)', theme: 'Faith', icon: '⚡' },
];

// ── Christian faith-based quotes from theologians and believers ──
const FAITH_QUOTES = [
  { text: 'You can give without loving, but you cannot love without giving.', author: 'Amy Carmichael', theme: 'Generosity' },
  { text: 'He is no fool who gives what he cannot keep to gain what he cannot lose.', author: 'Jim Elliot', theme: 'Stewardship' },
  { text: 'The poverty of our century is unlike that of any other. It is not, as poverty was before, the result of natural scarcity, but of a set of priorities imposed upon the rest of the world by those who are already well-off.', author: 'John Berger', theme: 'Justice' },
  { text: 'God does not need our money. But we need the experience of giving it.', author: 'Charles Spurgeon', theme: 'Giving' },
  { text: 'Earn all you can, save all you can, give all you can.', author: 'John Wesley', theme: 'Stewardship' },
  { text: 'Money is a good servant but a terrible master.', author: 'Francis Bacon', theme: 'Money' },
  { text: 'I have held many things in my hands, and I have lost them all; but whatever I have placed in God\'s hands, that I still possess.', author: 'Corrie ten Boom', theme: 'Faith' },
  { text: 'Our anxiety does not empty tomorrow of its sorrows, but only empties today of its strengths.', author: 'Charles Spurgeon', theme: 'Peace' },
  { text: 'Pray as though everything depended on God. Work as though everything depended on you.', author: 'Saint Augustine', theme: 'Diligence' },
  { text: 'God never gives someone a gift they are not capable of receiving. If He gives us the gift of Christmas, it is because we all have the ability to understand and receive it.', author: 'Pope Francis', theme: 'Grace' },
  { text: 'We must be willing to give up the life we have planned so as to have the life that is waiting for us.', author: 'Joseph Campbell', theme: 'Surrender' },
  { text: 'The Lord doesn\'t ask about your ability, only your availability; and if you prove your dependability, the Lord will increase your capability.', author: 'Neal A. Maxwell', theme: 'Stewardship' },
  { text: 'Faith is taking the first step even when you don\'t see the whole staircase.', author: 'Martin Luther King Jr.', theme: 'Faith' },
  { text: 'Patience is not passive waiting. Patience is active acceptance of the process required to attain your goals and dreams.', author: 'Ray A. Davis', theme: 'Patience' },
  { text: 'If you want peace, stop fighting. If you want peace of mind, stop fighting with your thoughts.', author: 'Peter McWilliams', theme: 'Peace' },
  { text: 'Humility is not thinking less of yourself, it\'s thinking of yourself less.', author: 'C.S. Lewis', theme: 'Humility' },
  { text: 'The greatest enemy of financial health is fear.', author: 'Suze Orman', theme: 'Mindset' },
  { text: 'The secret of getting ahead is getting started. The secret of getting started is breaking your complex overwhelming tasks into small manageable tasks, and then starting on the first one.', author: 'Mark Twain', theme: 'Diligence' },
  { text: 'Character cannot be developed in ease and quiet. Only through experience of trial and suffering can the soul be strengthened, ambition inspired, and success achieved.', author: 'Helen Keller', theme: 'Character' },
  { text: 'You will never plough a field if you only turn it over in your mind.', author: 'Irish Proverb', theme: 'Action' },
];

// Trading-specific affirmations
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
  { text: 'My account is a tool to build wealth, not a gambling chip.', category: 'Purpose' },
  { text: 'I trust the process. I trust my preparation. I trust God with the outcome.', category: 'Faith' },
  { text: 'Loss teaches more than profit — I welcome every lesson.', category: 'Growth' },
];

const ALL_THEMES = ['All', 'Money', 'Stewardship', 'Planning', 'Faith', 'Contentment', 'Discipline', 'Diligence', 'Providence', 'Priorities', 'Giving', 'Preservation', 'Patience'];

export default function BiblePage() {
  const [activeTab, setActiveTab] = useState<'verses' | 'quotes' | 'affirmations'>('verses');
  const [selectedTheme, setSelectedTheme] = useState('All');
  const [favorited, setFavorited] = useState<string[]>([]);
  const [randomVerse, setRandomVerse] = useState(() => VERSES[Math.floor(Math.random() * VERSES.length)]);

  const toggleFav = (text: string) =>
    setFavorited(f => f.includes(text) ? f.filter(t => t !== text) : [...f, text]);

  const filteredVerses = VERSES.filter(v =>
    selectedTheme === 'All' || v.theme === selectedTheme
  );

  return (
    <AppShell title="Bible & Mindset">
      {/* Verse of the day */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl p-5 mb-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-200 uppercase tracking-widest mb-2">✝️ Verse of the Session</p>
            <p className="text-base font-medium leading-relaxed italic mb-2">"{randomVerse.text}"</p>
            <p className="text-sm text-purple-200 font-semibold">— {randomVerse.ref}</p>
            <span className="mt-2 inline-block text-xs bg-purple-500/50 px-2 py-0.5 rounded-full">{randomVerse.theme}</span>
          </div>
          <button
            onClick={() => setRandomVerse(VERSES[Math.floor(Math.random() * VERSES.length)])}
            className="ml-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
            title="New verse"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {(['verses', 'quotes', 'affirmations'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium border capitalize transition-colors ${
              activeTab === tab
                ? 'bg-purple-600 text-white border-purple-600'
                : 'border-gray-200 text-gray-600 hover:border-purple-300'
            }`}
          >
            {tab === 'verses' ? `📖 Bible Verses (${VERSES.length})` : tab === 'quotes' ? `💬 Faith Quotes (${FAITH_QUOTES.length})` : `💪 Affirmations (${AFFIRMATIONS.length})`}
          </button>
        ))}
      </div>

      {/* ── BIBLE VERSES TAB ── */}
      {activeTab === 'verses' && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {ALL_THEMES.map(t => (
              <button
                key={t}
                onClick={() => setSelectedTheme(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedTheme === t
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'border-gray-200 text-gray-600 hover:border-purple-100 hover:bg-purple-50'
                }`}
              >
                {t} {t !== 'All' ? `(${VERSES.filter(v => v.theme === t).length})` : `(${VERSES.length})`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVerses.map((v, i) => (
              <Card key={i} className="bg-gradient-to-br from-purple-50/60 to-white border-purple-100">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{v.icon}</span>
                    <Badge variant="purple" size="sm">{v.theme}</Badge>
                  </div>
                  <button
                    onClick={() => toggleFav(v.text)}
                    className="text-gray-300 hover:text-red-500 transition-colors ml-2 flex-shrink-0"
                  >
                    <Heart size={16} className={favorited.includes(v.text) ? 'fill-red-500 text-red-500' : ''} />
                  </button>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed italic mb-2">{v.text}</p>
                <p className="text-xs text-purple-600 font-semibold">{v.ref}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── FAITH QUOTES TAB ── */}
      {activeTab === 'quotes' && (
        <>
          <p className="text-sm text-gray-500 mb-6">
            Wisdom from theologians, missionaries, reformers, and Christian thinkers — on money, faith, character, and purpose.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FAITH_QUOTES.map((q, i) => (
              <Card key={i} className="bg-gradient-to-br from-amber-50/40 to-white border-amber-100">
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="warning" size="sm">{q.theme}</Badge>
                  <button
                    onClick={() => toggleFav(q.text)}
                    className="text-gray-300 hover:text-red-500 transition-colors ml-2 flex-shrink-0"
                  >
                    <Heart size={16} className={favorited.includes(q.text) ? 'fill-red-500 text-red-500' : ''} />
                  </button>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed italic mb-2">"{q.text}"</p>
                <p className="text-xs text-amber-700 font-semibold">— {q.author}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── AFFIRMATIONS TAB ── */}
      {activeTab === 'affirmations' && (
        <>
          <p className="text-sm text-gray-500 mb-6">
            Read these before every trading session. Let them shape your decisions, not your emotions.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AFFIRMATIONS.map((a, i) => (
              <Card key={i} className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Badge variant="purple" size="sm" className="mb-2">{a.category}</Badge>
                    <p className="text-base font-medium text-gray-800 leading-relaxed">{a.text}</p>
                  </div>
                  <button
                    onClick={() => toggleFav(a.text)}
                    className="ml-3 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Heart size={16} className={favorited.includes(a.text) ? 'fill-red-500 text-red-500' : ''} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Favorites section */}
      {favorited.length > 0 && (
        <Card className="mt-8 border-yellow-200 bg-yellow-50">
          <CardHeader
            title={`⭐ My Favorites (${favorited.length})`}
            subtitle="Tap the heart again to remove"
          />
          <div className="space-y-3">
            {favorited.map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <p className="text-sm text-gray-700 italic border-l-2 border-yellow-400 pl-3 flex-1">{text}</p>
                <button onClick={() => toggleFav(text)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <Heart size={14} className="fill-red-400" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}
