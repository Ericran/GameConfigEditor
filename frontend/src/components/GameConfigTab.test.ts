// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import GameConfigTab from './GameConfigTab.vue';

vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function tab() {
    return mount(GameConfigTab, {
        props: {
            serverId: 7,
            server: { game_id: 'ark' } as any,
            pluginId: 'test-plugin',
        },
        global: {
            stubs: {
                Banner: { template: '<div><slot/><slot name="action"/><slot name="detail"/></div>' },
                ConfigEditor: {
                    name: 'ConfigEditor',
                    props: ['content'],
                    template: '<div data-test="editor">{{ content }}</div>',
                },
            },
        },
    });
}

describe('GameConfigTab request ordering', () => {
    beforeEach(() => vi.clearAllMocks());

    it('ignores an older load that finishes after the newly selected file', async () => {
        const first = deferred<{ data: string }>();
        const second = deferred<{ data: string }>();
        vi.mocked(axios.get).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const wrapper = tab();
        const selectors = wrapper.findAll('button');
        expect(selectors).toHaveLength(2);
        await selectors[1].trigger('click');

        second.resolve({ data: 'new-file-content' });
        await flushPromises();
        expect(wrapper.get('[data-test="editor"]').text()).toBe('new-file-content');

        first.resolve({ data: 'stale-first-file-content' });
        await flushPromises();
        expect(wrapper.get('[data-test="editor"]').text()).toBe('new-file-content');
    });

    it('does not switch files when the current editor has unsaved changes and the user cancels', async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: 'loaded-content' });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const wrapper = tab();
        await flushPromises();

        wrapper.findComponent({ name: 'ConfigEditor' }).vm.$emit('dirty-change', true);
        await wrapper.vm.$nextTick();
        await wrapper.findAll('button')[1].trigger('click');

        expect(confirm).toHaveBeenCalledOnce();
        expect(axios.get).toHaveBeenCalledOnce();
        expect(wrapper.get('[data-test="editor"]').text()).toBe('loaded-content');
    });

    it('retries a failed save through the editor with its latest draft', async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: 'loaded-content' });
        vi.mocked(axios.post).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
        const wrapper = tab();
        await flushPromises();

        const editor = wrapper.getComponent({ name: 'ConfigEditor' });
        editor.vm.$emit('save', 'draft-content');
        await flushPromises();
        expect(wrapper.text()).toContain('Use Save to retry');

        editor.vm.$emit('save', 'newer-draft-content');
        await flushPromises();

        expect(axios.get).toHaveBeenCalledTimes(3); // initial load + one conflict check per save attempt
        expect(axios.post).toHaveBeenCalledTimes(2);
        const retriedForm = vi.mocked(axios.post).mock.calls[1][1] as FormData;
        expect(await (retriedForm.get('file') as File).text()).toBe('newer-draft-content');
    });

    it('refuses to overwrite an externally changed file and provides a confirmed reload path', async () => {
        vi.mocked(axios.get)
            .mockResolvedValueOnce({ data: 'original-content' })
            .mockResolvedValueOnce({ data: 'externally-changed-content' })
            .mockResolvedValueOnce({ data: 'externally-changed-content' });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const wrapper = tab();
        await flushPromises();

        wrapper.getComponent({ name: 'ConfigEditor' }).vm.$emit('save', 'my-draft');
        await flushPromises();

        expect(axios.post).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('changed since it was loaded');
        const reload = wrapper.findAll('button').find((button) => button.text() === 'Reload');
        expect(reload).toBeTruthy();
        await reload!.trigger('click');
        await flushPromises();

        expect(confirm).toHaveBeenCalledOnce();
        expect(axios.get).toHaveBeenCalledTimes(3);
        expect(wrapper.get('[data-test="editor"]').text()).toBe('externally-changed-content');
    });
});
