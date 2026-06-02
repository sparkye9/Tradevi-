'use client';

interface Props {
  label: string;
  met: boolean | null; // null = unknown
}

export default function ConditionRow({ label, met }: Props) {
  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      {met === true && (
        <span className="text-green-500 font-bold" aria-label="met">&#10003;</span>
      )}
      {met === false && (
        <span className="text-gray-600" aria-label="not met">&#8212;</span>
      )}
      {met === null && (
        <span className="text-gray-600" aria-label="unknown">?</span>
      )}
      <span className={met === true ? 'text-white' : 'text-gray-500'}>{label}</span>
    </div>
  );
}
