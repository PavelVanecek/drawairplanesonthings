export function exportImage(imageElement, annotations) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // naturalWidth/Height are the real image dimensions
        canvas.width = imageElement.naturalWidth;
        canvas.height = imageElement.naturalHeight;

        // 1. Draw the base image
        ctx.drawImage(imageElement, 0, 0);

        // 2. Draw annotations
        const drawAnnotations = async () => {
            // Pre-load SVG blob URL once if same for all, or per annotation if different.
            // Here we assume same SVG content structure.
            // But strictness: each annotation might have different SVG state if we modified it?
            // Actually they are copies. Let's just grab the SVG from one of them or cache it?
            // To be safe, let's process them.

            for (const annotation of annotations) {
                const { x, y, rotation, scale, element } = annotation;

                ctx.save();

                // Calculate center
                // DOM (0,0) is center of image + x, y offset.
                // Image center:
                const cx = canvas.width / 2 + x;
                const cy = canvas.height / 2 + y;

                ctx.translate(cx, cy);
                ctx.rotate(rotation * Math.PI / 180);
                ctx.scale(scale, scale);

                // Get SVG data
                const svgData = new XMLSerializer().serializeToString(element.querySelector('svg'));
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                await new Promise((resolveImg) => {
                    const svgImg = new Image();
                    svgImg.onload = () => {
                        // Draw centered relative to transform
                        // Annotation wrapper size was 200x200, centered at 0,0 of wrapper.
                        ctx.drawImage(svgImg, -100, -100, 200, 200);
                        URL.revokeObjectURL(url);
                        resolveImg();
                    }
                    svgImg.src = url;
                });

                ctx.restore();
            }
        };

        drawAnnotations().then(() => {
            // Export
            const finalUrl = canvas.toDataURL('image/png');

            // Trigger download
            const link = document.createElement('a');
            link.download = 'annotated-image.png';
            link.href = finalUrl;
            link.click();

            resolve();
        });
    });
}
