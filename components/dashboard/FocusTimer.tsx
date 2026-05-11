'use client';
import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Timer, Play, Pause, RotateCcw, Plus, Minus } from 'lucide-react';

const PRESETS = [5, 10, 15, 25, 45, 60];

export function FocusTimer() {
  const [totalSecs, setTotalSecs] = useState(25 * 60);
  const [secsLeft, setSecsLeft]   = useState(25 * 60);
  const [running, setRunning]     = useState(false);
  const [phase, setPhase]         = useState<'focus' | 'break'>('focus');
  const [editing, setEditing]     = useState(false);
  const [editVal, setEditVal]     = useState('25');
  const inputRef = useRef<HTMLInputElement>(null);

  const minutes = Math.floor(secsLeft / 60);
  const seconds = secsLeft % 60;
  const progress = totalSecs > 0 ? ((totalSecs - secsLeft) / totalSecs) * 100 : 0;
  const circumference = 2 * Math.PI * 54;

  // Countdown tick
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSecsLeft(s => {
        if (s <= 1) {
          clearInterval(t);
          setRunning(false);
          const nextPhase = phase === 'focus' ? 'break' : 'focus';
          const nextSecs  = nextPhase === 'focus' ? 25 * 60 : 5 * 60;
          setPhase(nextPhase);
          setTotalSecs(nextSecs);
          return nextSecs;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, phase]);

  const adjustMins = (delta: number) => {
    setSecsLeft(prev => {
      const next = Math.max(60, prev + delta * 60);
      if (!running) setTotalSecs(next);
      return next;
    });
  };

  const applyPreset = (mins: number) => {
    setRunning(false);
    setTotalSecs(mins * 60);
    setSecsLeft(mins * 60);
    setPhase('focus');
  };

  const reset = () => {
    setRunning(false);
    setTotalSecs(25 * 60);
    setSecsLeft(25 * 60);
    setPhase('focus');
  };

  // Inline minute edit
  const startEdit = () => {
    if (running) return;
    setEditVal(String(minutes));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const m = Math.max(1, Math.min(999, parseInt(editVal) || 1));
    setTotalSecs(m * 60);
    setSecsLeft(m * 60 + seconds);
    setEditing(false);
  };

  const isFinished = secsLeft === 0;
  const ringColor = phase === 'focus' ? '#9333ea' : '#22c55e';
  const bgColor   = phase === 'focus' ? '#f3e8ff' : '#dcfce7';

  return (
    <Card>
      <CardHeader title="Focus Timer" icon={<Timer size={16} />} />

      {/* Preset chips */}
      <div className="flex flex-wrap justify-center gap-1 mb-3">
        {PRESETS.map(m => (
          <button
            key={m}
            onClick={() => applyPreset(m)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
              !running && totalSecs === m * 60
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {m}m
          </button>
        ))}
      </div>

      {/* Timer ring + adjust buttons */}
      <div className="flex items-center justify-center gap-4">
        {/* -5 min */}
        <button
          onClick={() => adjustMins(-5)}
          disabled={secsLeft <= 60}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 disabled:opacity-30 transition-colors"
          title="−5 minutes"
        >
          <Minus size={14} />
        </button>

        {/* Ring */}
        <div className="relative w-28 h-28">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke={bgColor} strokeWidth="8" />
            <circle
              cx="60" cy="60" r="54" fill="none"
              stroke={isFinished ? '#22c55e' : ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress / 100)}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {editing ? (
              <div className="flex items-center gap-0.5">
                <input
                  ref={inputRef}
                  type="number"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                  className="w-12 text-center text-lg font-bold bg-transparent border-b-2 border-purple-400 focus:outline-none text-gray-900"
                />
                <span className="text-sm text-gray-400">m</span>
              </div>
            ) : (
              <button
                onClick={startEdit}
                disabled={running}
                className="text-xl font-bold text-gray-900 leading-none tabular-nums disabled:cursor-default hover:text-purple-600 transition-colors"
                title={running ? '' : 'Click to edit time'}
              >
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </button>
            )}
            <span className={`text-[10px] font-medium mt-0.5 ${phase === 'focus' ? 'text-purple-400' : 'text-green-500'}`}>
              {isFinished ? '✓ done' : phase}
            </span>
          </div>
        </div>

        {/* +5 min */}
        <button
          onClick={() => adjustMins(5)}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600 transition-colors"
          title="+5 minutes"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Start / Stop / Reset */}
      <div className="flex items-center justify-center gap-2 mt-4">
        <button
          onClick={() => setRunning(r => !r)}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold transition-all shadow-sm ${
            running
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={reset}
          className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Reset"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </Card>
  );
}
