/**
 * 無限スクロール設定（オプション）
 */
function setupInfiniteScroll() {
    let isLoading = false;

    window.addEventListener('scroll', () => {
        if (isLoading) return;

        // ページ下部に近づいたら自動読み込み
        const scrollPosition = window.innerHeight + window.scrollY;
        const pageHeight = document.documentElement.scrollHeight;

        if (scrollPosition >= pageHeight - 500) {
            const data = getFilteredData();
            if (data.length > displayLimit) {
                isLoading = true;
                displayLimit += ITEMS_PER_LOAD;
                renderShifts(data);

                setTimeout(() => {
                    isLoading = false;
                }, 300);
            }
        }
    });
}
