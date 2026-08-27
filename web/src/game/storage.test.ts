import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from '../api/client'
import type {
  GameResponseDto,
  HistoryEntryDto,
} from '../api/types'
import type { GameState } from './types'

// useStorage builds its callbacks with useCallback and pulls the API client
// from useApiClient. We don't render it in a component, so stub useCallback to
// a passthrough and inject a mock api in place of useApiClient.
const mockApi = vi.hoisted(() => vi.fn())

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useMemo: (factory: () => unknown) => factory(),
  }
})

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, useApiClient: () => mockApi }
})

const { useStorage } = await import('./storage')

function sampleGameDto(overrides: Partial<GameResponseDto> = {}): GameResponseDto {
  return {
    id: 'game-1',
    difficulty: 'MEDIUM',
    puzzle: Array.from({ length: 9 }, () => Array(9).fill(0)),
    entries: Array.from({ length: 9 }, () => Array(9).fill(0)),
    notes: Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => Array(9).fill(false)),
    ),
    elapsedMs: 12_345,
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function sampleGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    difficulty: 'MEDIUM',
    puzzle: Array.from({ length: 9 }, () => Array(9).fill(0)),
    entries: Array.from({ length: 9 }, () => Array(9).fill(0)),
    notes: Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => Array(9).fill(false)),
    ),
    elapsedMs: 12_345,
    startedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function sampleHistoryDto(overrides: Partial<HistoryEntryDto> = {}): HistoryEntryDto {
  return {
    id: 'history-1',
    difficulty: 'EASY',
    elapsedMs: 60_000,
    completedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  mockApi.mockReset()
})

describe('loadCurrentGame', () => {
  it('maps the active game DTO to a GameState', async () => {
    const dto = sampleGameDto()
    mockApi.mockResolvedValueOnce(dto)

    const game = await useStorage().loadCurrentGame()

    expect(mockApi).toHaveBeenCalledWith('/api/games/active')
    expect(game).toEqual({
      difficulty: dto.difficulty,
      puzzle: dto.puzzle,
      entries: dto.entries,
      notes: dto.notes,
      elapsedMs: dto.elapsedMs,
      startedAt: new Date(dto.startedAt).getTime(),
    })
  })

  it('returns null when no active game exists (404)', async () => {
    mockApi.mockRejectedValueOnce(new ApiError('not found', 404, null))
    await expect(useStorage().loadCurrentGame()).resolves.toBeNull()
  })

  it('rethrows non-404 errors', async () => {
    mockApi.mockRejectedValueOnce(new ApiError('boom', 500, null))
    await expect(useStorage().loadCurrentGame()).rejects.toThrow('boom')
  })
})

describe('startGame', () => {
  it('POSTs the difficulty and returns the new game', async () => {
    const dto = sampleGameDto({ difficulty: 'HARD' })
    mockApi.mockResolvedValueOnce(dto)

    const game = await useStorage().startGame('HARD')

    expect(mockApi).toHaveBeenCalledWith('/api/games', {
      method: 'POST',
      body: { difficulty: 'HARD' },
    })
    expect(game.difficulty).toBe('HARD')
  })
})

describe('saveCurrentGame', () => {
  it('PATCHes the mutable fields of the active game', async () => {
    mockApi.mockResolvedValueOnce(sampleGameDto())
    const state = sampleGameState({ elapsedMs: 99_999 })

    await useStorage().saveCurrentGame(state)

    expect(mockApi).toHaveBeenCalledWith('/api/games/active', {
      method: 'PATCH',
      body: {
        entries: state.entries,
        notes: state.notes,
        elapsedMs: state.elapsedMs,
      },
    })
  })
})

describe('clearCurrentGame', () => {
  it('DELETEs the active game', async () => {
    mockApi.mockResolvedValueOnce(undefined)
    await useStorage().clearCurrentGame()
    expect(mockApi).toHaveBeenCalledWith('/api/games/active', { method: 'DELETE' })
  })

  it('treats a 404 as already cleared', async () => {
    mockApi.mockRejectedValueOnce(new ApiError('not found', 404, null))
    await expect(useStorage().clearCurrentGame()).resolves.toBeUndefined()
  })

  it('rethrows non-404 errors', async () => {
    mockApi.mockRejectedValueOnce(new ApiError('boom', 500, null))
    await expect(useStorage().clearCurrentGame()).rejects.toThrow('boom')
  })
})

describe('completeGame', () => {
  it('POSTs entries and elapsed time, returning a history entry', async () => {
    const dto = sampleHistoryDto()
    mockApi.mockResolvedValueOnce(dto)
    const entries = sampleGameDto().entries

    const entry = await useStorage().completeGame(entries, 60_000)

    expect(mockApi).toHaveBeenCalledWith('/api/games/active/complete', {
      method: 'POST',
      body: { entries, elapsedMs: 60_000 },
    })
    expect(entry).toEqual({
      difficulty: dto.difficulty,
      elapsedMs: dto.elapsedMs,
      completedAt: new Date(dto.completedAt).getTime(),
    })
  })
})

describe('loadHistory', () => {
  it('maps each history DTO to a HistoryEntry', async () => {
    const dtos = [
      sampleHistoryDto({ completedAt: '2026-01-03T00:00:00.000Z' }),
      sampleHistoryDto({ completedAt: '2026-01-02T00:00:00.000Z' }),
    ]
    mockApi.mockResolvedValueOnce(dtos)

    const history = await useStorage().loadHistory()

    expect(mockApi).toHaveBeenCalledWith('/api/history')
    expect(history).toEqual(
      dtos.map((d) => ({
        difficulty: d.difficulty,
        elapsedMs: d.elapsedMs,
        completedAt: new Date(d.completedAt).getTime(),
      })),
    )
  })

  it('returns an empty array when there is no history', async () => {
    mockApi.mockResolvedValueOnce([])
    await expect(useStorage().loadHistory()).resolves.toEqual([])
  })
})
