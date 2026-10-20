package io.freemytv;

/** Keeps the focused card inside the viewport, with room for the focus animation at either edge. */
final class RecommendationRail {
    private RecommendationRail() {}

    static float scrollFor(int index, int count, float offset, float width, float gap, float viewport) {
        if (count <= 0) return 0;
        index = Math.max(0, Math.min(count - 1, index));
        float left = index * (width + gap), right = left + width;
        if (left < offset) offset = left;
        else if (right > offset + viewport) offset = right - viewport;
        return Math.max(0, Math.min(Math.max(0, count * (width + gap) - gap - viewport), offset));
    }
}
