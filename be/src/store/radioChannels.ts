import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type RadioChannel = {
    id: string;
    name: string;
};

const RADIO_CHANNELS_FILE = resolve(process.cwd(), 'be/data/radio-channels.json');

function normalizeChannels(input: unknown): RadioChannel[] {
    if (!Array.isArray(input)) return [];
    const result: RadioChannel[] = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Record<string, unknown>;
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        if (!name) continue;
        const rawId = raw.id;
        const id =
            typeof rawId === 'string' ? rawId.trim() :
                typeof rawId === 'number' ? String(rawId) :
                    `ch-${result.length + 1}`;
        result.push({ id: id || `ch-${result.length + 1}`, name });
    }
    return result;
}

function loadFromFile(): RadioChannel[] {
    try {
        const raw = readFileSync(RADIO_CHANNELS_FILE, 'utf-8');
        return normalizeChannels(JSON.parse(raw));
    } catch {
        return [];
    }
}

function saveToFile(channels: RadioChannel[]): void {
    try {
        writeFileSync(RADIO_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
    } catch (err) {
        console.error('[radio-channels] failed to write file:', err);
    }
}

let _channels: RadioChannel[] = loadFromFile();

export function getRadioChannels(): RadioChannel[] {
    return _channels;
}

export function setRadioChannels(input: unknown): RadioChannel[] {
    _channels = normalizeChannels(input);
    saveToFile(_channels);
    return _channels;
}

export function formatChannelList(channels: RadioChannel[]): string {
    if (channels.length === 0) return 'chưa có kênh nào';
    const names = channels.map((c) => c.name);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} và ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}`;
}

export function getNextChannel(
    currentChannelId: string | null,
    overrideChannels?: RadioChannel[] | null,
): RadioChannel | null {
    const channels = (overrideChannels && overrideChannels.length > 0) ? overrideChannels : _channels;
    if (channels.length === 0) return null;
    if (!currentChannelId) return channels[0];
    const currentIndex = channels.findIndex(ch => ch.id === currentChannelId);
    if (currentIndex === -1 || currentIndex === channels.length - 1) return channels[0];
    return channels[currentIndex + 1];
}

export function getPrevChannel(
    currentChannelId: string | null,
    overrideChannels?: RadioChannel[] | null,
): RadioChannel | null {
    const channels = (overrideChannels && overrideChannels.length > 0) ? overrideChannels : _channels;
    if (channels.length === 0) return null;
    if (!currentChannelId) return channels[channels.length - 1];
    const currentIndex = channels.findIndex(ch => ch.id === currentChannelId);
    if (currentIndex === -1 || currentIndex === 0) return channels[channels.length - 1];
    return channels[currentIndex - 1];
}
