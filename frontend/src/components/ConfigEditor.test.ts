// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConfigEditor from './ConfigEditor.vue';
import { keyvalueFormat } from '../formats/keyvalue';
import { palworldFormat } from '../formats/palworld';
import type { GameConfig } from '../games/registry';

const game: GameConfig = {
    gameId: 'test',
    gameName: 'Test Game',
    fileName: 'server.properties',
    dir: '',
    format: keyvalueFormat,
    schema: [
        {
            id: 'main',
            title: 'Main',
            icon: 'fa-solid fa-gear',
            fields: [{ key: 'name', label: 'Name', type: 'text' }],
        },
    ],
};

function editor(content = 'name=before\n') {
    return mount(ConfigEditor, {
        props: {
            content,
            filePath: '/server.properties',
            fileName: 'server.properties',
            extension: 'properties',
            pluginId: 'test-plugin',
            game,
            embedded: true,
        },
    });
}

describe('ConfigEditor save state', () => {
    it('keeps the document dirty until the parent confirms a successful save by remounting it', async () => {
        const wrapper = editor();
        const input = wrapper.get('input[type="text"]');
        await input.setValue('after');

        const save = wrapper.get('button');
        expect(save.attributes('disabled')).toBeUndefined();
        await save.trigger('click');

        expect(wrapper.emitted('save')).toEqual([['name=after\n']]);
        expect(save.attributes('disabled')).toBeUndefined();
    });

    it('disables Save while the parent is persisting an earlier request', async () => {
        const wrapper = mount(ConfigEditor, {
            props: {
                content: 'name=before\n',
                filePath: '/server.properties',
                fileName: 'server.properties',
                extension: 'properties',
                pluginId: 'test-plugin',
                game,
                embedded: true,
                saving: true,
            } as any,
        });
        const input = wrapper.get('input[type="text"]');
        await input.setValue('after');

        const save = wrapper.get('button');
        expect(input.attributes('disabled')).toBe('');
        expect(save.attributes('disabled')).toBe('');
        await save.trigger('click');
        expect(wrapper.emitted('save')).toBeUndefined();
    });

    it('removes both Palworld relay advertisement keys instead of writing an empty numeric port', async () => {
        const relayGame: GameConfig = {
            gameId: 'palworld',
            gameName: 'Palworld',
            fileName: 'PalWorldSettings.ini',
            dir: '',
            format: palworldFormat,
            relayGuard: { ipKey: 'PublicIP', portKey: 'PublicPort' },
        };
        const wrapper = mount(ConfigEditor, {
            props: {
                content: 'OptionSettings=(ServerName="Test",PublicIP="203.0.113.2",PublicPort=8211)',
                filePath: '/PalWorldSettings.ini',
                fileName: 'PalWorldSettings.ini',
                extension: 'ini',
                pluginId: 'test-plugin',
                game: relayGame,
                embedded: true,
            },
        });

        const clear = wrapper.findAll('button').find((button) => button.text().includes('Clear public IP'))!;
        await clear.trigger('click');
        await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');

        const saved = wrapper.emitted('save')![0][0] as string;
        expect(saved).toBe('OptionSettings=(ServerName="Test")');
        expect(saved).not.toContain('PublicPort=');
    });
});
