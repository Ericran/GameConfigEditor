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

    return { loading, saving, error, notice, reset };
}
