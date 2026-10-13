import { queueWindow, removeFromQueue } from './queue';

const q = ['a', 'b', 'c', 'd', 'e'];

describe('removeFromQueue', () => {
  it('keeps the current track when others are removed', () => {
    expect(removeFromQueue(q, 2, [0, 4])).toEqual({
      queue: ['b', 'c', 'd'],
      index: 1,
      currentRemoved: false,
    });
  });

  it('moves to the track that followed a removed current track', () => {
    expect(removeFromQueue(q, 1, [1, 2])).toEqual({
      queue: ['a', 'd', 'e'],
      index: 1,
      currentRemoved: true,
    });
  });

  it('has no current track when the removed current one was last', () => {
    expect(removeFromQueue(q, 4, [3, 4])).toMatchObject({ index: -1, currentRemoved: true });
    expect(removeFromQueue(q, 0, [0, 1, 2, 3, 4])).toEqual({
      queue: [],
      index: -1,
      currentRemoved: true,
    });
  });

  it('handles a queue without current track and duplicate ids', () => {
    expect(removeFromQueue(q, -1, [0])).toEqual({
      queue: ['b', 'c', 'd', 'e'],
      index: -1,
      currentRemoved: false,
    });
    expect(removeFromQueue(['a', 'b', 'a'], 2, [0])).toMatchObject({ queue: ['b', 'a'], index: 1 });
  });
});

describe('queueWindow', () => {
  const big = Array.from({ length: 100 }, (_, i) => `t${i}`);

  it('keeps small queues whole', () => {
    expect(queueWindow(q, 3, 10)).toEqual({ ids: q, index: 3 });
  });

  it('keeps a window around the current track', () => {
    const { ids, index } = queueWindow(big, 50, 20);
    expect(ids).toHaveLength(20);
    expect(ids[index]).toBe('t50');
    expect(index).toBe(2); // A few tracks of history are kept.
  });

  it('clamps the window to the ends', () => {
    expect(queueWindow(big, 0, 20)).toMatchObject({ index: 0 });
    const end = queueWindow(big, 99, 20);
    expect(end.ids.at(-1)).toBe('t99');
    expect(end.ids[end.index]).toBe('t99');
    expect(queueWindow(big, -1, 20)).toMatchObject({ index: -1, ids: big.slice(0, 20) });
  });
});
