'use client';

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/RemoveCircleOutlineOutlined';
import { fieldValues, matchTracks } from '@/client/catalog/dynamic';
import { formatCount } from '@/client/format';
import { useCatalogStore } from '@/client/stores/catalogStore';
import { useDynamicPlaylistStore, type DynamicEditor } from '@/client/stores/dynamicPlaylistStore';
import {
  DYNAMIC_FIELDS,
  FIELD_LABELS,
  NUMERIC_FIELDS,
  OPERATOR_LABELS,
  operatorsFor,
  type DynamicCriterion,
  type DynamicField,
  type DynamicOperator,
  type DynamicPlaylistInput,
} from '@/lib/dynamicPlaylists/types';

/** A criterion while editing: the value is the raw text of its field. */
interface DraftCriterion {
  key: number;
  field: DynamicField;
  op: DynamicOperator;
  value: string;
}

let nextKey = 1;
const draftOf = (criterion: DynamicCriterion): DraftCriterion => ({
  key: nextKey++,
  field: criterion.field,
  op: criterion.op,
  value: String(criterion.value),
});

/** The saved form of a draft criterion, or null while it is incomplete. */
function criterionOf(draft: DraftCriterion): DynamicCriterion | null {
  const text = draft.value.trim();
  if (!text) return null;
  if (!NUMERIC_FIELDS.has(draft.field)) return { field: draft.field, op: draft.op, value: text };
  const year = Number(text);
  return Number.isInteger(year) && year >= 0 && year <= 9999
    ? { field: draft.field, op: draft.op, value: year }
    : null;
}

/** Creates or edits a dynamic (smart) playlist: name, all/any, and its criteria. */
export default function DynamicPlaylistDialog() {
  const editor = useDynamicPlaylistStore((state) => state.editor);
  const close = useDynamicPlaylistStore((state) => state.closeEditor);
  // The last form stays rendered while the dialog fades out.
  const [shown, setShown] = useState(editor);
  if (editor && editor !== shown) setShown(editor);
  return (
    <Dialog
      open={editor !== null}
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="dynamic-playlist-title"
    >
      {/* Keyed so that each opening starts from the playlist's saved definition. */}
      {shown && <Editor key={shown.serial} editor={shown} onClose={close} />}
    </Dialog>
  );
}

function Editor({ editor, onClose }: Readonly<{ editor: DynamicEditor; onClose(): void }>) {
  const catalog = useCatalogStore((state) => state.catalog);
  const [name, setName] = useState(editor.initial.name);
  const [match, setMatch] = useState(editor.initial.match);
  const [drafts, setDrafts] = useState(() => editor.initial.criteria.map(draftOf));
  const [saving, setSaving] = useState(false);

  const criteria = drafts.map(criterionOf);
  const complete = criteria.every((c) => c !== null);
  const input: DynamicPlaylistInput | null =
    complete && name.trim()
      ? { name: name.trim(), match, criteria: criteria as DynamicCriterion[] }
      : null;
  // A few milliseconds even for a large library: recomputed as the criteria are typed.
  const count =
    catalog && complete
      ? matchTracks(catalog.tracks, { name, match, criteria: criteria as DynamicCriterion[] })
          .length
      : null;

  const update = (key: number, change: Partial<DraftCriterion>) =>
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...change } : d)));

  const save = async () => {
    if (!input) return;
    setSaving(true);
    const saved = await useDynamicPlaylistStore.getState().save(input);
    if (!saved) setSaving(false);
  };

  return (
    <>
      <DialogTitle id="dynamic-playlist-title">
        {editor.id ? 'Edit smart playlist' : 'New smart playlist'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            size="small"
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" id="dynamic-match-label">
              Tracks matching
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={match}
              onChange={(_, value: 'all' | 'any' | null) => value && setMatch(value)}
              aria-labelledby="dynamic-match-label"
            >
              <ToggleButton value="all">all criteria</ToggleButton>
              <ToggleButton value="any">any criterion</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {drafts.map((draft, index) => (
            <CriterionRow
              key={draft.key}
              index={index}
              draft={draft}
              suggestions={
                catalog && draft.field !== 'year' ? fieldValues(catalog, draft.field) : []
              }
              removable={drafts.length > 1}
              onChange={(change) => update(draft.key, change)}
              onRemove={() => setDrafts((current) => current.filter((d) => d.key !== draft.key))}
            />
          ))}
          <Box>
            <Button
              startIcon={<AddIcon />}
              size="small"
              onClick={() =>
                setDrafts((current) => [
                  ...current,
                  { key: nextKey++, field: 'genre', op: '==', value: '' },
                ])
              }
            >
              Add criterion
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" role="status">
            {count === null
              ? 'Complete every criterion to see the matching tracks.'
              : `${formatCount(count)} ${count === 1 ? 'track matches' : 'tracks match'}`}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!input || saving} onClick={() => void save()}>
          Save
        </Button>
      </DialogActions>
    </>
  );
}

interface CriterionRowProps {
  index: number;
  draft: DraftCriterion;
  suggestions: string[];
  removable: boolean;
  onChange(change: Partial<DraftCriterion>): void;
  onRemove(): void;
}

function CriterionRow({
  index,
  draft,
  suggestions,
  removable,
  onChange,
  onRemove,
}: Readonly<CriterionRowProps>) {
  const label = `Criterion ${index + 1}`;
  const numeric = NUMERIC_FIELDS.has(draft.field);
  return (
    <Stack
      direction="row"
      spacing={1}
      role="group"
      aria-label={label}
      sx={{ alignItems: 'flex-start' }}
    >
      <TextField
        select
        size="small"
        label="Tag"
        value={draft.field}
        onChange={(event) => {
          const field = event.target.value as DynamicField;
          const op = operatorsFor(field).includes(draft.op) ? draft.op : '==';
          onChange({ field, op, value: '' });
        }}
        sx={{ width: 150, flex: 'none' }}
      >
        {DYNAMIC_FIELDS.map((field) => (
          <MenuItem key={field} value={field}>
            {FIELD_LABELS[field]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Condition"
        value={draft.op}
        onChange={(event) => onChange({ op: event.target.value as DynamicOperator })}
        sx={{ width: 110, flex: 'none' }}
      >
        {operatorsFor(draft.field).map((op) => (
          <MenuItem key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </MenuItem>
        ))}
      </TextField>
      {numeric ? (
        <TextField
          size="small"
          label="Value"
          type="number"
          value={draft.value}
          onChange={(event) => onChange({ value: event.target.value })}
          slotProps={{ htmlInput: { min: 0, max: 9999 } }}
          sx={{ flex: 1 }}
        />
      ) : (
        <Autocomplete
          freeSolo
          size="small"
          options={suggestions}
          inputValue={draft.value}
          onInputChange={(_, value) => onChange({ value })}
          renderInput={(params) => <TextField {...params} label="Value" />}
          sx={{ flex: 1 }}
        />
      )}
      <IconButton
        aria-label={`Remove ${label.toLowerCase()}`}
        disabled={!removable}
        onClick={onRemove}
      >
        <RemoveIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}
