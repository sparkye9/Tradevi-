'use client';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Timer, Play, Pause, RotateCcw } from 'lucide-react';

export function FocusTimer() {
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');

  const totalSecs = phase === 'focus' ? 25 * 60 : 5 * 60;
  const elapsed = totalSecs - (minutes * 60 + seconds);
  const progress = (elapsed / totalSecs) * 100;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSeconds(s => {
        if (s > 0) return s - 1;
        setMinutes(m => {
          if (m > 0) { return m - 1; }
          // Timer done
          setRunning(false);
          setPhase(p => p === 'focus' ? 'break' : 'focus');
          const next = phase === 'focus' ? 5 : 25;
          setMinutes(next);
          setSeconds(0);
          return m;
        });
        return 59;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, phase]);

  const reset = () => {
    setRunning(false);
    setPhase('focus');
    setMinutes(25);
    setSeconds(0);
  };

  return (
    <Card>
      <CardHeader title="Focus Timer" icon={<Timer size={16} />} />
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#f3e8ff" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="34" fill="none"
              stroke={phase === 'focus' ? '#9333ea' : '#22c55e'} strokeWidth="6"
              strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-gray-900 leading-none">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
            <span className="text-xs text-gray-400">{phase}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="xs" variant={running ? 'outline' : 'primary'} onClick={() => setRunning(r => !r)}>
            {running ? <Pause size={12} /> : <Play size={12} />}
            <span className="ml-1">{running ? 'Pause' : 'Start'}</span>
          </Button>
          <Button size="xs" variant="ghost" onClick={reset}>
            <RotateCcw size={12} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
