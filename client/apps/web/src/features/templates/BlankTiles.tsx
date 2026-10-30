import { Icon } from '#/components/icons';
import { Spinner } from '#/components/ui';
import type { GalleryType } from './links';
import { useCreateDocument } from './use-create-document';

/**
 * Blank starters are ordinary (hidden) templates, so creating one uses the same copy-on-use flow
 * as any template. They are linked by id rather than listed in the gallery grid.
 */
const TILES = [
  { id: 'blank-document', type: 'docx', label: 'Blank document', hint: 'An empty page, Word style', color: 'bg-[#2b579a]', glyph: 'W' },
  { id: 'blank-presentation', type: 'pptx', label: 'Blank presentation', hint: 'One empty slide, PowerPoint style', color: 'bg-[#c43e1c]', glyph: 'P' },
] as const;

function BlankTile({ tile }: { tile: (typeof TILES)[number] }) {
  const { create, pending, error } = useCreateDocument(tile.id);
  return (
    <li>
      <button
        type="button"
        onClick={create}
        disabled={pending}
        aria-busy={pending}
        className="group flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-left transition hover:border-brand-600 hover:bg-brand-50/40 disabled:cursor-wait disabled:opacity-70 sm:w-72"
      >
        <span className={`relative grid size-14 shrink-0 place-items-center rounded-xl text-lg font-black text-white ${tile.color}`}>
          {tile.glyph}
          <span className="absolute -bottom-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-white text-slate-700 ring-1 ring-slate-200 transition group-hover:bg-brand-600 group-hover:text-white">
            {pending ? <Spinner /> : <Icon name="plus" size={14} />}
          </span>
        </span>
        <span>
          <span className="block text-[15px] font-semibold text-slate-900">{tile.label}</span>
          <span className="block text-xs text-slate-500">{pending ? 'Creating…' : tile.hint}</span>
        </span>
      </button>
      {error ? (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function BlankTiles({ type }: { type: GalleryType }) {
  const tiles = TILES.filter((tile) => type === 'all' || tile.type === type);
  return (
    <section aria-labelledby="blank-title" className="space-y-3">
      <h2 id="blank-title" className="text-lg font-semibold">
        Start from scratch
      </h2>
      <ul className="flex flex-wrap gap-4">
        {tiles.map((tile) => (
          <BlankTile key={tile.id} tile={tile} />
        ))}
      </ul>
    </section>
  );
}
