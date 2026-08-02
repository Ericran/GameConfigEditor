/**
 * The load/save bookkeeping both server tabs need: two in-flight flags, a
 * mutually-exclusive error/notice pair, and the reset every request starts with.
 */
import { ref } from 'vue';

/**
 * Best error text for a failed panel request. GameAP returns its own message in
 * the response body, which is far more useful than axios's "Request failed with
 * status code 500", so prefer it and fall back progressively.
 */
export function errMsg(e: any, fallback: string): string {
    return e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;
}

/**
 * Handle on one in-flight load. `current()` is false once a newer load has
 * started, and `done()` only clears the spinner for the newest one.
 */
export interface LoadAttempt {
    current(): boolean;
    done(): void;
}

export function useAsyncPanel() {
    const loading = ref(false);
    const saving = ref(false);
    const error = ref<string | null>(null);
    const notice = ref<string | null>(null);

    /** Clear both banners - every request begins by doing this. */
    function reset() {
        error.value = null;
        notice.value = null;
    }

    // Bumped per load so a slow response that lost the race can be dropped.
    let generation = 0;

    /**
     * Begin a load, superseding any that is still in flight.
     *
     * Every await inside a load can resolve after the user has already switched
     * files or hit reload, so the older call must not write its stale result
     * over the newer one. Check `current()` after each await before touching
     * reactive state, and call `done()` in a finally.
     */
    function beginLoad(): LoadAttempt {
        const mine = ++generation;
        reset();
        loading.value = true;
        return {
            current: () => mine === generation,
            done: () => {
                if (mine === generation) loading.value = false;
            },
        };
    }

    return { loading, saving, error, notice, reset, beginLoad };
}
