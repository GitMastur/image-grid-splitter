import os
import tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
from PIL import Image, ImageTk
import numpy as np
import cv2

# Set modern theme
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("dark-blue")

class ImageGridSplitterApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("GridSplitter Studio")
        self.geometry("1150x800")
        self.minsize(850, 650)
        
        # State
        self.raw_image = None
        self.scale_factor = 1.0
        self.offset_x = 0
        self.offset_y = 0
        self.export_dir = os.path.expanduser("~/Pictures")
        self.thumbnails = []
        
        # Draggable handles state
        self.active_handle = None
        self.handle_radius = 6
        
        # Configure grid layout
        self.grid_columnconfigure(0, weight=0, minsize=320)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=0, minsize=180)
        
        self.setup_sidebar()
        self.setup_workspace()
        self.setup_previews()
        
        # Canvas binding
        self.canvas.bind("<Configure>", self.on_canvas_resize)
        self.canvas.bind("<ButtonPress-1>", self.on_canvas_click)
        self.canvas.bind("<B1-Motion>", self.on_canvas_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_canvas_release)
        self.canvas.bind("<Motion>", self.on_canvas_hover)

    def setup_sidebar(self):
        sidebar = ctk.CTkFrame(self, corner_radius=0, width=320)
        sidebar.grid(row=0, column=0, rowspan=2, sticky="nsew", padx=0, pady=0)
        
        # Header
        header = ctk.CTkLabel(sidebar, text="GridSplitter Studio", font=ctk.CTkFont(size=22, weight="bold"))
        header.pack(padx=20, pady=(20, 5), anchor="w")
        
        subtitle = ctk.CTkLabel(sidebar, text="Drag outer bounds or use auto-detect", text_color="gray", font=ctk.CTkFont(size=12))
        subtitle.pack(padx=20, pady=(0, 20), anchor="w")
        
        # File selector
        self.btn_load = ctk.CTkButton(sidebar, text="Load Single Image", command=self.load_image, height=40, font=ctk.CTkFont(weight="bold"))
        self.btn_load.pack(padx=20, pady=10, fill="x")
        
        # Layout detection options
        self.var_autodetect = tk.BooleanVar(value=True)
        self.chk_autodetect = ctk.CTkCheckBox(sidebar, text="Auto-detect Grid Layout", variable=self.var_autodetect, font=ctk.CTkFont(weight="bold"))
        self.chk_autodetect.pack(padx=20, pady=10, anchor="w")
        
        # Grid settings frame
        grid_frame = ctk.CTkFrame(sidebar)
        grid_frame.pack(padx=20, pady=5, fill="x")
        
        label_grid = ctk.CTkLabel(grid_frame, text="Grid Dimensions", font=ctk.CTkFont(weight="bold"))
        label_grid.grid(row=0, column=0, columnspan=2, padx=10, pady=5, sticky="w")
        
        ctk.CTkLabel(grid_frame, text="Columns:").grid(row=1, column=0, padx=10, pady=5, sticky="e")
        self.var_cols = tk.IntVar(value=3)
        self.spin_cols = ctk.CTkEntry(grid_frame, textvariable=self.var_cols, width=60)
        self.spin_cols.grid(row=1, column=1, padx=10, pady=5, sticky="w")
        self.spin_cols.bind("<KeyRelease>", lambda e: self.update_grid())
        
        ctk.CTkLabel(grid_frame, text="Rows:").grid(row=2, column=0, padx=10, pady=5, sticky="e")
        self.var_rows = tk.IntVar(value=2)
        self.spin_rows = ctk.CTkEntry(grid_frame, textvariable=self.var_rows, width=60)
        self.spin_rows.grid(row=2, column=1, padx=10, pady=5, sticky="w")
        self.spin_rows.bind("<KeyRelease>", lambda e: self.update_grid())
        
        # Offsets and Margins frame
        offset_frame = ctk.CTkFrame(sidebar)
        offset_frame.pack(padx=20, pady=10, fill="x")
        
        label_offsets = ctk.CTkLabel(offset_frame, text="Offset & Borders (px)", font=ctk.CTkFont(weight="bold"))
        label_offsets.grid(row=0, column=0, columnspan=4, padx=10, pady=10, sticky="w")
        
        # Margins Left/Right
        ctk.CTkLabel(offset_frame, text="Left:").grid(row=1, column=0, padx=5, pady=5, sticky="e")
        self.var_m_left = tk.IntVar(value=0)
        self.entry_m_left = ctk.CTkEntry(offset_frame, textvariable=self.var_m_left, width=50)
        self.entry_m_left.grid(row=1, column=1, padx=5, pady=5)
        self.entry_m_left.bind("<KeyRelease>", lambda e: self.update_grid())
        
        ctk.CTkLabel(offset_frame, text="Right:").grid(row=1, column=2, padx=5, pady=5, sticky="e")
        self.var_m_right = tk.IntVar(value=0)
        self.entry_m_right = ctk.CTkEntry(offset_frame, textvariable=self.var_m_right, width=50)
        self.entry_m_right.grid(row=1, column=3, padx=5, pady=5)
        self.entry_m_right.bind("<KeyRelease>", lambda e: self.update_grid())
        
        # Margins Top/Bottom
        ctk.CTkLabel(offset_frame, text="Top:").grid(row=2, column=0, padx=5, pady=5, sticky="e")
        self.var_m_top = tk.IntVar(value=0)
        self.entry_m_top = ctk.CTkEntry(offset_frame, textvariable=self.var_m_top, width=50)
        self.entry_m_top.grid(row=2, column=1, padx=5, pady=5)
        self.entry_m_top.bind("<KeyRelease>", lambda e: self.update_grid())
        
        ctk.CTkLabel(offset_frame, text="Bottom:").grid(row=2, column=2, padx=5, pady=5, sticky="e")
        self.var_m_bottom = tk.IntVar(value=0)
        self.entry_m_bottom = ctk.CTkEntry(offset_frame, textvariable=self.var_m_bottom, width=50)
        self.entry_m_bottom.grid(row=2, column=3, padx=5, pady=5)
        self.entry_m_bottom.bind("<KeyRelease>", lambda e: self.update_grid())
        
        # Gaps X/Y
        ctk.CTkLabel(offset_frame, text="Gap X:").grid(row=3, column=0, padx=5, pady=5, sticky="e")
        self.var_gap_x = tk.IntVar(value=0)
        self.entry_gap_x = ctk.CTkEntry(offset_frame, textvariable=self.var_gap_x, width=50)
        self.entry_gap_x.grid(row=3, column=1, padx=5, pady=5)
        self.entry_gap_x.bind("<KeyRelease>", lambda e: self.update_grid())
        
        ctk.CTkLabel(offset_frame, text="Gap Y:").grid(row=3, column=2, padx=5, pady=5, sticky="e")
        self.var_gap_y = tk.IntVar(value=0)
        self.entry_gap_y = ctk.CTkEntry(offset_frame, textvariable=self.var_gap_y, width=50)
        self.entry_gap_y.grid(row=3, column=3, padx=5, pady=5)
        self.entry_gap_y.bind("<KeyRelease>", lambda e: self.update_grid())
        
        # Export Settings
        export_frame = ctk.CTkFrame(sidebar)
        export_frame.pack(padx=20, pady=10, fill="x")
        
        label_export = ctk.CTkLabel(export_frame, text="Export Settings", font=ctk.CTkFont(weight="bold"))
        label_export.pack(padx=10, pady=(10, 5), anchor="w")
        
        # File Format Selection
        ctk.CTkLabel(export_frame, text="Format:").pack(padx=10, pady=2, anchor="w")
        self.var_format = tk.StringVar(value="PNG")
        self.format_menu = ctk.CTkOptionMenu(export_frame, values=["PNG", "JPEG"], variable=self.var_format)
        self.format_menu.pack(padx=10, pady=5, fill="x")
        
        # File Prefix
        ctk.CTkLabel(export_frame, text="Single Prefix:").pack(padx=10, pady=2, anchor="w")
        self.var_prefix = tk.StringVar(value="headshot")
        self.entry_prefix = ctk.CTkEntry(export_frame, textvariable=self.var_prefix)
        self.entry_prefix.pack(padx=10, pady=5, fill="x")
        
        # Target folder label
        self.lbl_target = ctk.CTkLabel(sidebar, text=f"Target: ...{self.export_dir[-25:]}", font=ctk.CTkFont(size=11), text_color="gray")
        self.lbl_target.pack(padx=20, pady=2, anchor="w")
        
        self.btn_select_dir = ctk.CTkButton(sidebar, text="Choose Output Folder", fg_color="transparent", border_width=1, command=self.select_output_dir)
        self.btn_select_dir.pack(padx=20, pady=5, fill="x")
        
        # Action buttons
        self.btn_export = ctk.CTkButton(sidebar, text="Export Slices", command=self.export_slices, height=35, state="disabled")
        self.btn_export.pack(padx=20, pady=(10, 5), fill="x")
        
        self.btn_batch = ctk.CTkButton(sidebar, text="Batch Process Folder", command=self.batch_process_folder, height=35, fg_color="#10b981", hover_color="#059669")
        self.btn_batch.pack(padx=20, pady=(5, 20), fill="x")

    def setup_workspace(self):
        self.workspace = ctk.CTkFrame(self)
        self.workspace.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)
        
        self.canvas = tk.Canvas(self.workspace, bg="#0d1117", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True, padx=5, pady=5)
        
        self.canvas_text = self.canvas.create_text(
            150, 150, text="Please load an image to begin\nDrag the outer border lines directly to adjust", fill="#6b7280", font=("Arial", 14, "bold"), justify="center"
        )

    def setup_previews(self):
        self.preview_panel = ctk.CTkFrame(self, corner_radius=8, height=180)
        self.preview_panel.grid(row=1, column=1, sticky="ew", padx=10, pady=(0, 10))
        
        self.preview_header = ctk.CTkLabel(self.preview_panel, text="Cropped Previews", font=ctk.CTkFont(weight="bold"))
        self.preview_header.pack(padx=15, pady=(5, 2), anchor="w")
        
        self.scroll_frame = ctk.CTkScrollableFrame(self.preview_panel, orientation="horizontal", height=130)
        self.scroll_frame.pack(fill="both", expand=True, padx=10, pady=(0, 5))

    def estimate_grid_layout(self, pil_image):
        """Attempts to mathematically identify grid dimensions using horizontal/vertical seam detection."""
        try:
            # Convert PIL image to OpenCV Grayscale
            img_np = np.array(pil_image)
            if img_np.ndim == 3:
                gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY).astype(float)
            else:
                gray = img_np.astype(float)
                
            h, w = gray.shape
            
            # Sum vertical and horizontal absolute differences
            col_diffs = np.mean(np.abs(gray[:, 1:] - gray[:, :-1]), axis=0)
            row_diffs = np.mean(np.abs(gray[1:, :] - gray[:-1, :]), axis=1)
            
            def get_peaks(diffs, min_dist):
                peaks = []
                threshold = np.mean(diffs) + 1.0 * np.std(diffs)
                for i in range(1, len(diffs) - 1):
                    if diffs[i] > threshold:
                        left = max(0, i - min_dist)
                        right = min(len(diffs), i + min_dist + 1)
                        if diffs[i] == max(diffs[left:right]):
                            peaks.append(i)
                return peaks

            cols_peaks = get_peaks(col_diffs, int(w * 0.15))
            rows_peaks = get_peaks(row_diffs, int(h * 0.15))
            
            def match_dimension(peaks, length):
                best_dim = 1
                best_err = 9999
                for dim in range(2, 7): # Test dividing by 2 up to 6
                    matched = 0
                    err_sum = 0
                    for part in range(1, dim):
                        target_ratio = part / dim
                        closest_err = min([abs(p/length - target_ratio) for p in peaks]) if peaks else 1.0
                        if closest_err < 0.025: # match tolerance
                            matched += 1
                            err_sum += closest_err
                    if matched == dim - 1:
                        if err_sum < best_err:
                            best_err = err_sum
                            best_dim = dim
                return best_dim

            cols = match_dimension(cols_peaks, w)
            rows = match_dimension(rows_peaks, h)
            return cols, rows
        except Exception as e:
            print(f"Layout auto-detection failed: {e}")
            return 1, 1

    def load_image(self):
        file_path = filedialog.askopenfilename(
            filetypes=[("Image files", "*.png *.jpg *.jpeg *.webp *.bmp *.gif")]
        )
        if not file_path:
            return
        
        try:
            self.raw_image = Image.open(file_path)
            self.canvas.delete(self.canvas_text)
            
            # Reset margins for the new image
            self.var_m_left.set(0)
            self.var_m_right.set(0)
            self.var_m_top.set(0)
            self.var_m_bottom.set(0)
            self.var_gap_x.set(0)
            self.var_gap_y.set(0)
            
            # Run layout estimation if enabled
            if self.var_autodetect.get():
                cols, rows = self.estimate_grid_layout(self.raw_image)
                if cols > 1 or rows > 1:
                    self.var_cols.set(cols)
                    self.var_rows.set(rows)
            
            self.btn_export.configure(state="normal")
            self.render_image_on_canvas()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load image:\n{str(e)}")

    def render_image_on_canvas(self):
        if not self.raw_image:
            return
            
        canvas_w = self.canvas.winfo_width()
        canvas_h = self.canvas.winfo_height()
        
        if canvas_w < 10 or canvas_h < 10:
            return
            
        img_w, img_h = self.raw_image.width, self.raw_image.height
        
        self.scale_factor = min(canvas_w / img_w, canvas_h / img_h)
        new_w = int(img_w * self.scale_factor)
        new_h = int(img_h * self.scale_factor)
        
        resized = self.raw_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
        self.display_image = ImageTk.PhotoImage(resized)
        
        self.offset_x = (canvas_w - new_w) // 2
        self.offset_y = (canvas_h - new_h) // 2
        
        self.canvas.delete("all")
        self.canvas.create_image(self.offset_x, self.offset_y, anchor="nw", image=self.display_image)
        
        self.draw_grid_overlay()

    def get_layout_coords(self):
        if not self.raw_image:
            return None
        try:
            m_left = self.var_m_left.get()
            m_right = self.var_m_right.get()
            m_top = self.var_m_top.get()
            m_bottom = self.var_m_bottom.get()
        except (tk.TclError, ValueError):
            return None
            
        x1 = self.offset_x + int(m_left * self.scale_factor)
        y1 = self.offset_y + int(m_top * self.scale_factor)
        x2 = self.offset_x + int((self.raw_image.width - m_right) * self.scale_factor)
        y2 = self.offset_y + int((self.raw_image.height - m_bottom) * self.scale_factor)
        return (x1, y1, x2, y2)

    def draw_grid_overlay(self):
        if not self.raw_image:
            return
            
        self.canvas.delete("grid_line")
        self.canvas.delete("handle")
        
        try:
            cols = max(1, self.var_cols.get())
            rows = max(1, self.var_rows.get())
            
            m_left = max(0, self.var_m_left.get())
            m_right = max(0, self.var_m_right.get())
            m_top = max(0, self.var_m_top.get())
            m_bottom = max(0, self.var_m_bottom.get())
            
            gap_x = max(0, self.var_gap_x.get())
            gap_y = max(0, self.var_gap_y.get())
        except (tk.TclError, ValueError):
            return
            
        img_w = self.raw_image.width
        img_h = self.raw_image.height
        
        active_w = img_w - m_left - m_right
        active_h = img_h - m_top - m_bottom
        
        if active_w <= 0 or active_h <= 0:
            return
            
        cell_w = (active_w - gap_x * (cols - 1)) / cols
        cell_h = (active_h - gap_y * (rows - 1)) / rows
        
        if cell_w <= 0 or cell_h <= 0:
            return

        self.slices_data = []
        
        for r in range(rows):
            for c in range(cols):
                orig_x = m_left + c * (cell_w + gap_x)
                orig_y = m_top + r * (cell_h + gap_y)
                
                if orig_x + cell_w > img_w or orig_y + cell_h > img_h:
                    continue
                    
                screen_x1 = self.offset_x + int(orig_x * self.scale_factor)
                screen_y1 = self.offset_y + int(orig_y * self.scale_factor)
                screen_x2 = self.offset_x + int((orig_x + cell_w) * self.scale_factor)
                screen_y2 = self.offset_y + int((orig_y + cell_h) * self.scale_factor)
                
                self.canvas.create_rectangle(
                    screen_x1, screen_y1, screen_x2, screen_y2,
                    outline="#a855f7" if (c==0 or r==0 or c==cols-1 or r==rows-1) else "#6366f1",
                    width=2, tags="grid_line"
                )
                
                index = r * cols + c + 1
                self.canvas.create_text(
                    screen_x1 + 12, screen_y1 + 12,
                    text=f"#{index}", fill="#ffffff", font=("Arial", 10, "bold"),
                    tags="grid_line", anchor="nw"
                )
                
                self.slices_data.append({
                    "box": (int(orig_x), int(orig_y), int(orig_x + cell_w), int(orig_y + cell_h)),
                    "index": index,
                    "row": r + 1,
                    "col": c + 1
                })
        
        coords = self.get_layout_coords()
        if coords:
            x1, y1, x2, y2 = coords
            handles = {
                "nw": (x1, y1), "ne": (x2, y1), "sw": (x1, y2), "se": (x2, y2),
                "n": ((x1+x2)//2, y1), "s": ((x1+x2)//2, y2),
                "w": (x1, (y1+y2)//2), "e": (x2, (y1+y2)//2)
            }
            
            for h_type, (hx, hy) in handles.items():
                self.canvas.create_rectangle(
                    hx - self.handle_radius, hy - self.handle_radius,
                    hx + self.handle_radius, hy + self.handle_radius,
                    fill="#ffffff", outline="#6366f1", width=2, tags=("handle", f"handle_{h_type}")
                )
                
        self.update_previews()

    def on_canvas_click(self, event):
        if not self.raw_image:
            return
            
        coords = self.get_layout_coords()
        if not coords:
            return
            
        x1, y1, x2, y2 = coords
        mx, my = event.x, event.y
        r = self.handle_radius + 4
        
        if abs(mx - x1) <= r and abs(my - y1) <= r:
            self.active_handle = "nw"
        elif abs(mx - x2) <= r and abs(my - y1) <= r:
            self.active_handle = "ne"
        elif abs(mx - x1) <= r and abs(my - y2) <= r:
            self.active_handle = "sw"
        elif abs(mx - x2) <= r and abs(my - y2) <= r:
            self.active_handle = "se"
        elif abs(mx - (x1+x2)//2) <= r and abs(my - y1) <= r:
            self.active_handle = "n"
        elif abs(mx - (x1+x2)//2) <= r and abs(my - y2) <= r:
            self.active_handle = "s"
        elif abs(mx - x1) <= r and abs(my - (y1+y2)//2) <= r:
            self.active_handle = "w"
        elif abs(mx - x2) <= r and abs(my - (y1+y2)//2) <= r:
            self.active_handle = "e"
        else:
            self.active_handle = None

    def on_canvas_drag(self, event):
        if not self.raw_image or not self.active_handle:
            return
            
        img_x = (event.x - self.offset_x) / self.scale_factor
        img_y = (event.y - self.offset_y) / self.scale_factor
        
        w = self.raw_image.width
        h = self.raw_image.height
        
        img_x = max(0, min(w, img_x))
        img_y = max(0, min(h, img_y))
        
        min_size = 20
        
        try:
            m_left = self.var_m_left.get()
            m_right = self.var_m_right.get()
            m_top = self.var_m_top.get()
            m_bottom = self.var_m_bottom.get()
        except Exception:
            return
            
        if "w" in self.active_handle:
            val = int(img_x)
            if w - m_right - val >= min_size:
                self.var_m_left.set(val)
        if "e" in self.active_handle:
            val = int(w - img_x)
            if w - m_left - val >= min_size:
                self.var_m_right.set(val)
        if "n" in self.active_handle:
            val = int(img_y)
            if h - m_bottom - val >= min_size:
                self.var_m_top.set(val)
        if "s" in self.active_handle:
            val = int(h - img_y)
            if h - m_top - val >= min_size:
                self.var_m_bottom.set(val)
                
        self.draw_grid_overlay()

    def on_canvas_release(self, event):
        self.active_handle = None

    def on_canvas_hover(self, event):
        if not self.raw_image:
            return
        coords = self.get_layout_coords()
        if not coords:
            return
            
        x1, y1, x2, y2 = coords
        mx, my = event.x, event.y
        r = self.handle_radius + 4
        
        cursor = ""
        if (abs(mx - x1) <= r and abs(my - y1) <= r) or (abs(mx - x2) <= r and abs(my - y2) <= r):
            cursor = "size_nw_se"
        elif (abs(mx - x2) <= r and abs(my - y1) <= r) or (abs(mx - x1) <= r and abs(my - y2) <= r):
            cursor = "size_ne_sw"
        elif abs(mx - (x1+x2)//2) <= r and (abs(my - y1) <= r or abs(my - y2) <= r):
            cursor = "size_ns"
        elif (abs(mx - x1) <= r or abs(mx - x2) <= r) and abs(my - (y1+y2)//2) <= r:
            cursor = "size_we"
            
        self.canvas.config(cursor=cursor)

    def update_previews(self):
        for widget in self.scroll_frame.winfo_children():
            widget.destroy()
            
        self.thumbnails = []
        
        if not self.raw_image or not hasattr(self, 'slices_data'):
            return
            
        for slice_info in self.slices_data[:50]:
            box = slice_info["box"]
            
            try:
                cropped = self.raw_image.crop(box)
                thumb = cropped.copy()
                thumb.thumbnail((80, 80), Image.Resampling.LANCZOS)
                
                photo = ImageTk.PhotoImage(thumb)
                self.thumbnails.append(photo)
                
                item = ctk.CTkFrame(self.scroll_frame, corner_radius=6, fg_color="#1f2937")
                item.pack(side="left", padx=5, pady=2)
                
                lbl_img = tk.Label(item, image=photo, bg="#1f2937")
                lbl_img.pack(padx=5, pady=5)
                
                lbl_title = ctk.CTkLabel(item, text=f"#{slice_info['index']}", font=ctk.CTkFont(size=10))
                lbl_title.pack(pady=(0, 2))
            except Exception:
                pass

    def update_grid(self):
        self.draw_grid_overlay()

    def on_canvas_resize(self, event):
        self.render_image_on_canvas()

    def select_output_dir(self):
        directory = filedialog.askdirectory(initialdir=self.export_dir)
        if directory:
            self.export_dir = directory
            self.lbl_target.configure(text=f"Target: ...{directory[-25:]}")

    def export_slices(self):
        if not self.raw_image or not hasattr(self, 'slices_data') or len(self.slices_data) == 0:
            messagebox.showwarning("Warning", "No slices available to export.")
            return
            
        prefix = self.var_prefix.get() or "headshot"
        fmt = self.var_format.get()
        ext = "jpg" if fmt == "JPEG" else "png"
        pil_format = "JPEG" if fmt == "JPEG" else "PNG"
        
        success_count = 0
        for slice_info in self.slices_data:
            box = slice_info["box"]
            try:
                cropped = self.raw_image.crop(box)
                out_filename = f"{prefix}_r{slice_info['row']}_c{slice_info['col']}.{ext}"
                out_path = os.path.join(self.export_dir, out_filename)
                
                if pil_format == "JPEG":
                    if cropped.mode in ("RGBA", "LA") or (cropped.mode == "P" and "transparency" in cropped.info):
                        cropped = cropped.convert("RGB")
                    cropped.save(out_path, format=pil_format, quality=95)
                else:
                    cropped.save(out_path, format=pil_format)
                    
                success_count += 1
            except Exception as e:
                print(f"Error saving slice {slice_info['index']}: {e}")
                
        messagebox.showinfo("Export Success", f"Successfully exported {success_count} headshots to:\n{self.export_dir}")

    def batch_process_folder(self):
        input_dir = filedialog.askdirectory(title="Select Input Folder Containing Grid Images")
        if not input_dir:
            return
            
        try:
            static_cols = max(1, self.var_cols.get())
            static_rows = max(1, self.var_rows.get())
            m_left = max(0, self.var_m_left.get())
            m_right = max(0, self.var_m_right.get())
            m_top = max(0, self.var_m_top.get())
            m_bottom = max(0, self.var_m_bottom.get())
            gap_x = max(0, self.var_gap_x.get())
            gap_y = max(0, self.var_gap_y.get())
        except (tk.TclError, ValueError):
            messagebox.showerror("Error", "Please enter valid integer values for dimensions/margins/gaps.")
            return

        valid_extensions = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")
        files = [f for f in os.listdir(input_dir) if f.lower().endswith(valid_extensions)]
        
        if not files:
            messagebox.showinfo("Info", "No valid image files found in the selected folder.")
            return
            
        dest_dir = self.export_dir
        if not os.path.exists(dest_dir):
            messagebox.showerror("Error", "Target output directory does not exist. Choose another output folder.")
            return

        fmt = self.var_format.get()
        ext = "jpg" if fmt == "JPEG" else "png"
        pil_format = "JPEG" if fmt == "JPEG" else "PNG"
        
        processed_files = 0
        total_slices = 0
        use_autodetect = self.var_autodetect.get()
        
        for filename in files:
            file_path = os.path.join(input_dir, filename)
            base_name, _ = os.path.splitext(filename)
            
            try:
                img = Image.open(file_path)
                img_w, img_h = img.width, img.height
                
                # Auto detect per image or use sidebar settings
                cols, rows = static_cols, static_rows
                if use_autodetect:
                    auto_c, auto_r = self.estimate_grid_layout(img)
                    if auto_c > 1 or auto_r > 1:
                        cols, rows = auto_c, auto_r
                
                active_w = img_w - m_left - m_right
                active_h = img_h - m_top - m_bottom
                
                if active_w <= 0 or active_h <= 0:
                    continue
                    
                cell_w = (active_w - gap_x * (cols - 1)) / cols
                cell_h = (active_h - gap_y * (rows - 1)) / rows
                
                if cell_w <= 0 or cell_h <= 0:
                    continue
                
                for r in range(rows):
                    for c in range(cols):
                        orig_x = m_left + c * (cell_w + gap_x)
                        orig_y = m_top + r * (cell_h + gap_y)
                        
                        if orig_x + cell_w > img_w or orig_y + cell_h > img_h:
                            continue
                            
                        box = (int(orig_x), int(orig_y), int(orig_x + cell_w), int(orig_y + cell_h))
                        cropped = img.crop(box)
                        
                        out_filename = f"{base_name}_r{r+1}_c{c+1}.{ext}"
                        out_path = os.path.join(dest_dir, out_filename)
                        
                        if pil_format == "JPEG":
                            if cropped.mode in ("RGBA", "LA") or (cropped.mode == "P" and "transparency" in cropped.info):
                                cropped = cropped.convert("RGB")
                            cropped.save(out_path, format=pil_format, quality=95)
                        else:
                            cropped.save(out_path, format=pil_format)
                            
                        total_slices += 1
                        
                processed_files += 1
            except Exception as e:
                print(f"Failed to batch process {filename}: {e}")
                
        messagebox.showinfo(
            "Batch Complete",
            f"Successfully processed {processed_files} images.\n"
            f"Generated {total_slices} total cropped headshots.\n"
            f"Saved to: {dest_dir}"
        )

if __name__ == "__main__":
    app = ImageGridSplitterApp()
    app.mainloop()
