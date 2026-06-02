'use client';
import { useEffect, useState } from 'react';

const VERSES = [
  { text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.', ref: 'Proverbs 3:5-6' },
  { text: 'I can do all things through Christ which strengtheneth me.', ref: 'Philippians 4:13' },
  { text: 'Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', ref: 'Joshua 1:9' },
  { text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.', ref: 'Isaiah 40:31' },
  { text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', ref: 'Jeremiah 29:11' },
  { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
  { text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.', ref: 'Romans 8:28' },
  { text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.', ref: '2 Timothy 1:7' },
  { text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.', ref: 'Philippians 4:6' },
  { text: 'Commit thy works unto the LORD, and thy thoughts shall be established.', ref: 'Proverbs 16:3' },
  { text: 'The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?', ref: 'Psalm 27:1' },
  { text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed.', ref: 'Joshua 1:9' },
  { text: 'Delight thyself also in the LORD; and he shall give thee the desires of thine heart.', ref: 'Psalm 37:4' },
  { text: 'Seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.', ref: 'Matthew 6:33' },
  { text: 'The heart of man plans his way, but the LORD establishes his steps.', ref: 'Proverbs 16:9' },
  { text: 'Cast thy burden upon the LORD, and he shall sustain thee.', ref: 'Psalm 55:22' },
  { text: 'No weapon that is formed against thee shall prosper.', ref: 'Isaiah 54:17' },
  { text: 'I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth.', ref: 'Psalm 121:1-2' },
  { text: 'For with God nothing shall be impossible.', ref: 'Luke 1:37' },
  { text: 'Now unto him that is able to do exceeding abundantly above all that we ask or think, according to the power that worketh in us.', ref: 'Ephesians 3:20' },
];

export default function BibleVerse() {
  const [verse, setVerse] = useState<{ text: string; ref: string } | null>(null);

  useEffect(() => {
    setVerse(VERSES[Math.floor(Math.random() * VERSES.length)]);
  }, []);

  if (!verse) return null;

  return (
    <footer className="bg-[#0a0a0a] border-t border-[#1a1a1a] px-6 py-3">
      <p className="text-xs italic text-gray-600 text-center">
        &ldquo;{verse.text}&rdquo; &mdash; {verse.ref}
      </p>
    </footer>
  );
}
