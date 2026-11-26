import { describe, it, expect, vi, beforeEach } from 'vitest'
import apiService from '@/service/api-service'
import { getAccessToken } from '@/auth/keycloak'

vi.mock('@/auth/keycloak', () => ({ getAccessToken: vi.fn() }))

describe('apiService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(getAccessToken).mockResolvedValue(undefined)
  })

  it('sends the access token when someone is signed in', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('access-token')
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await apiService.get('/v1/credentials')
    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer access-token')
  })

  it('sends no Authorization header when nobody is signed in', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await apiService.get('/v1/public/unsubscribe/abc')
    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('performs GET request and returns JSON data', async () => {
    const mockData = { id: 1, name: 'Test' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    )

    const result = await apiService.get<typeof mockData>('/v1/test')
    expect(result).toEqual(mockData)
  })

  it('formats path correctly when path has no leading slash', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await apiService.get('v1/no-slash')
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/no-slash',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('preserves caller-supplied headers while adding Content-Type if omitted', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await apiService.get('/v1/custom-header', {
      headers: { Authorization: 'Bearer token' },
    })
    expect(fetchSpy).toHaveBeenCalled()
    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit
    const headers = calledOptions.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('performs POST request with serialized body', async () => {
    const payload = { name: 'Alice' }
    const mockResponse = { id: 2, ...payload }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 201 }))

    const result = await apiService.post<typeof mockResponse>('/v1/topics', payload)
    expect(result).toEqual(mockResponse)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/topics',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
  })

  it('performs PUT request with serialized body', async () => {
    const payload = { name: 'Bob' }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))

    const result = await apiService.put<typeof payload>('/v1/topics/road-closures', payload)
    expect(result).toEqual(payload)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/topics/road-closures',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    )
  })

  it('performs DELETE request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }))

    const result = await apiService.delete<{ deleted: boolean }>('/v1/topics/road-closures')
    expect(result).toEqual({ deleted: true })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/topics/road-closures',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('handles 204 No Content without error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await apiService.delete('/v1/topics/road-closures')
    expect(result).toBeUndefined()
  })

  it('throws an error and logs when response is not ok', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    )

    await expect(apiService.get('/v1/not-found')).rejects.toThrow('HTTP error! status: 404')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('rethrows and logs network errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failure'))

    await expect(apiService.get('/v1/network-err')).rejects.toThrow('Network failure')
    expect(errorSpy).toHaveBeenCalled()
  })
})
