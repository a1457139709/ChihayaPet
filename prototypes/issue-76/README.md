# Throwaway application icon prototype — issue #76

Question: does a conventional head-and-shoulders crop of the supplied artwork work as the application icon?

Source: https://github.com/user-attachments/assets/868bff83-1d36-4420-b6c1-473644104f58
Original: 300×300 RGB. Crop bounds: (62, 0, 246, 184), right/bottom exclusive.
Review: enlarged crop and 128/64/32/16 px previews, resized with Pillow LANCZOS; no AI retouching.

The user approved review.png on 2026-10-04: “可以，就这样吧”.
Decision: retain the background and minor supporting-character edges, use this exact crop for macOS arm64 and Windows x64 application icons. Keep tray/menu-bar icons unchanged. Accept softness at larger sizes.

This branch is a prototype archive, not production source.
