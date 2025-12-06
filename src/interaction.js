
/**
 * State and logic for managing the interactive viewport and annotations
 */
export class InteractionManager {
    constructor() {
        this.elements = {
            dropZone: document.getElementById('dropZone'),
            fileInput: document.getElementById('fileInput'),
            viewport: document.getElementById('canvasViewport'),
            content: document.getElementById('canvasContent'),
            image: document.getElementById('targetImage'),
            annotationContainer: document.getElementById('annotationContainer'),
            zoomLevel: document.getElementById('zoomLevel'),
            app: document.getElementById('app'),
        };

        this.state = {
            scale: 1, // Viewport zoom
            pan: { x: 0, y: 0 },
            isPanning: false,
            panStart: { x: 0, y: 0 },

            annotations: [], // Array of objects: { id, x, y, rotation, scale, element }
            selectedAnnotationId: null,

            isDraggingAnnotation: false,
            isRotatingAnnotation: false,
            dragOffset: { x: 0, y: 0 },

            // Temporary state for interactions
            activeInteractionId: null,
            dragStartMouse: { x: 0, y: 0 },
            initialState: null // snapshot for rotate/scale
        };

        this.init();
    }

    init() {
        // Zoom / Pan
        this.elements.dropZone.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.elements.dropZone.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());
        // Key listener for delete
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedAnnotationId) {
                this.removeSelectedAnnotation();
            }
        });

        // Controls
        document.getElementById('zoomIn').addEventListener('click', () => this.adjustZoom(0.1));
        document.getElementById('zoomOut').addEventListener('click', () => this.adjustZoom(-0.1));
        document.getElementById('addAnnotationBtn').addEventListener('click', () => this.addAnnotation());
        document.getElementById('removeAnnotationBtn').addEventListener('click', () => this.removeSelectedAnnotation());
    }

    // --- Image Loading ---
    loadImage(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.image.src = e.target.result;
            this.elements.image.onload = () => {
                // Reset view
                this.state.scale = 1;
                this.state.pan = { x: 0, y: 0 };
                this.updateTransform();

                // Clear existing annotations logic if desired?
                // For now, let's keep them or maybe clear? Usually new image = new start.
                this.clearAnnotations();

                // Show viewport, hide empty state
                this.elements.viewport.classList.remove('hidden');
                document.querySelector('.empty-state').style.display = 'none';

                this.updateButtons();

                // Add initial annotation
                if (this.state.annotations.length === 0) {
                    this.addAnnotation();
                }
            };
        };
        reader.readAsDataURL(file);
    }

    clearAnnotations() {
        this.state.annotations.forEach(a => a.element.remove());
        this.state.annotations = [];
        this.selectAnnotation(null);
    }

    updateButtons() {
        const hasImage = !!this.elements.image.src;
        document.getElementById('exportBtn').disabled = !hasImage;
        document.getElementById('addAnnotationBtn').disabled = !hasImage;
        document.getElementById('removeAnnotationBtn').disabled = !this.state.selectedAnnotationId;
    }

    handlePaste(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                const blob = item.getAsFile();
                this.loadImage(blob);
                return;
            }
        }
    }

    handleDrop(e) {
        e.preventDefault();
        this.elements.dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            this.loadImage(e.dataTransfer.files[0]);
        }
    }

    // --- Viewport Logic ---
    handleWheel(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = -e.deltaY * 0.001; // Scale factor
            this.adjustZoom(delta);
        }
    }

    adjustZoom(delta) {
        let newScale = this.state.scale + delta;
        // Clamp between 0.1 and 2.0 (200% as requested)
        newScale = Math.min(Math.max(newScale, 0.1), 2.0);
        this.state.scale = newScale;
        this.updateTransform();
    }

    handleMouseDown(e) {
        // Check if target is part of annotation
        const annotationWrapper = e.target.closest('.annotation-wrapper');
        if (annotationWrapper) {
            const id = annotationWrapper.dataset.id;
            this.selectAnnotation(id);

            if (e.target.closest('.rotate-handle')) {
                this.startRotate(e, id);
            } else {
                this.startDrag(e, id);
            }
            e.stopPropagation();
            return;
        }

        // Deselect if clicking background
        if (this.state.selectedAnnotationId) {
            this.selectAnnotation(null);
        }

        // Otherwise, start panning
        if (this.elements.image.src) {
            this.state.isPanning = true;
            this.state.panStart = { x: e.clientX - this.state.pan.x, y: e.clientY - this.state.pan.y };
            this.elements.viewport.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        if (this.state.isPanning) {
            this.state.pan.x = e.clientX - this.state.panStart.x;
            this.state.pan.y = e.clientY - this.state.panStart.y;
            this.updateTransform();
        }

        if (this.state.isDraggingAnnotation) {
            this.updateAnnotationPosition(e);
        }

        if (this.state.isRotatingAnnotation) {
            this.updateAnnotationRotationScale(e);
        }
    }

    handleMouseUp() {
        this.state.isPanning = false;
        this.elements.viewport.style.cursor = '';

        if (this.state.isDraggingAnnotation) {
            this.state.isDraggingAnnotation = false;
            document.body.classList.remove('dragging-annotation');
            this.state.activeInteractionId = null;
        }

        if (this.state.isRotatingAnnotation) {
            this.state.isRotatingAnnotation = false;
            this.state.activeInteractionId = null;
        }
    }

    updateTransform() {
        const { scale, pan } = this.state;
        this.elements.content.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
        this.elements.zoomLevel.textContent = `${Math.round(scale * 100)}%`;
    }

    // --- Annotation Logic ---

    selectAnnotation(id) {
        // Deselect current
        if (this.state.selectedAnnotationId && this.state.selectedAnnotationId !== id) {
            const prev = this.getAnnotation(this.state.selectedAnnotationId);
            if (prev) prev.element.classList.remove('selected');
        }

        this.state.selectedAnnotationId = id;
        this.updateButtons();

        if (id) {
            const curr = this.getAnnotation(id);
            if (curr) {
                curr.element.classList.add('selected');
                // Bring to front logic (DOM order)
                this.elements.annotationContainer.appendChild(curr.element);
            }
        }
    }

    getAnnotation(id) {
        return this.state.annotations.find(a => a.id === id);
    }

    async addAnnotation() {
        if (!this.elements.image.src) return;

        const response = await fetch('/src/assets/annotation.svg');
        const svgText = await response.text();

        const id = 'ann-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.className = 'annotation-wrapper';
        wrapper.dataset.id = id;

        // Initial Styles
        wrapper.style.position = 'absolute';
        wrapper.style.left = '50%';
        wrapper.style.top = '50%';
        wrapper.style.width = '200px';
        wrapper.style.height = '200px';
        wrapper.style.transformOrigin = 'center center';
        wrapper.style.marginLeft = '-100px';
        wrapper.style.marginTop = '-100px';
        wrapper.innerHTML = svgText;

        // Handle
        const handle = document.createElement('div');
        handle.className = 'rotate-handle';
        handle.style.position = 'absolute';
        handle.style.right = '97%';
        handle.style.top = '75%';
        handle.style.width = '24px';
        handle.style.height = '24px';
        handle.style.borderRadius = '50%';
        handle.style.backgroundColor = 'white';
        handle.style.border = '2px solid var(--primary-color)';
        handle.style.cursor = 'grab';
        handle.style.transform = 'translateY(-50%)';
        wrapper.appendChild(handle);

        this.elements.annotationContainer.appendChild(wrapper);

        // Slight random offset so they don't stack perfectly if adding multiple
        const offset = this.state.annotations.length * 20;

        const newAnnotation = {
            id,
            x: offset,
            y: offset,
            rotation: 0,
            scale: 1,
            element: wrapper
        };

        this.state.annotations.push(newAnnotation);
        this.renderAnnotationTransform(newAnnotation);

        this.selectAnnotation(id);
    }

    removeSelectedAnnotation() {
        if (!this.state.selectedAnnotationId) return;
        const index = this.state.annotations.findIndex(a => a.id === this.state.selectedAnnotationId);
        if (index > -1) {
            this.state.annotations[index].element.remove();
            this.state.annotations.splice(index, 1);
            this.selectAnnotation(null);
        }
    }

    startDrag(e, id) {
        this.state.isDraggingAnnotation = true;
        this.state.activeInteractionId = id;
        document.body.classList.add('dragging-annotation');

        const annotation = this.getAnnotation(id);
        this.state.dragStartMouse = { x: e.clientX, y: e.clientY };
        this.state.initialState = { x: annotation.x, y: annotation.y };
    }

    updateAnnotationPosition(e) {
        const annotation = this.getAnnotation(this.state.activeInteractionId);
        if (!annotation) return;

        const dx = (e.clientX - this.state.dragStartMouse.x) / this.state.scale;
        const dy = (e.clientY - this.state.dragStartMouse.y) / this.state.scale;

        annotation.x = this.state.initialState.x + dx;
        annotation.y = this.state.initialState.y + dy;

        this.renderAnnotationTransform(annotation);
    }

    startRotate(e, id) {
        this.state.isRotatingAnnotation = true;
        this.state.activeInteractionId = id;

        const annotation = this.getAnnotation(id);
        const rect = annotation.element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        this.state.rotationCenter = { x: centerX, y: centerY };
        this.state.startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);

        this.state.initialState = {
            rotation: annotation.rotation,
            scale: annotation.scale,
            startDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY)
        };
    }

    updateAnnotationRotationScale(e) {
        const annotation = this.getAnnotation(this.state.activeInteractionId);
        if (!annotation) return;

        const dx = e.clientX - this.state.rotationCenter.x;
        const dy = e.clientY - this.state.rotationCenter.y;

        // Rotation
        const currentAngle = Math.atan2(dy, dx);
        let angleDiff = currentAngle - this.state.startAngle;
        annotation.rotation = this.state.initialState.rotation + (angleDiff * 180 / Math.PI);

        // Scaling
        const currentDistance = Math.hypot(dx, dy);
        const scaleRatio = currentDistance / this.state.initialState.startDistance;
        annotation.scale = this.state.initialState.scale * scaleRatio;

        this.renderAnnotationTransform(annotation);
    }

    renderAnnotationTransform(annotation) {
        const { x, y, rotation, scale } = annotation;
        annotation.element.style.transform =
            `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
    }
}
