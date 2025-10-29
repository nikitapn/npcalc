# Atlas Generation Comparison

## Your Images
- `dot.png`: 240×240 (much larger)
- `footsteps.png`: 55×57 (small)
- `footsteps1.png`: 55×57 (small)

---

## Mode 1: Horizontal (as-is) ❌
**Problem:** Wastes space due to size mismatch

```
Atlas: 350×240 (tall!)
┌──────────────┬──┬──┐
│              │  │  │
│   dot.png    │f1│f2│
│   240×240    │  │  │
│              │55│55│
│              │× │× │
│              │57│57│
└──────────────┴──┴──┘
       ↑          ↑
   Big image   Small images create
              vertical strips with
              wasted transparent space
```

**Issues:**
- Footsteps occupy thin vertical strips
- Most of the space is transparent/wasted
- Inefficient for GPU texture cache

---

## Mode 2: Resize (recommended) ✅
**Solution:** Resize all to uniform cells

```
Atlas: 720×240 (wide, efficient!)
┌──────────┬──────────┬──────────┐
│          │          │          │
│ dot.png  │footsteps1│footsteps │
│ 240×240  │  (55×57) │  (55×57) │
│(original)│ centered │ centered │
│          │          │          │
└──────────┴──────────┴──────────┘
    240px      240px      240px
```

**Benefits:**
- ✅ Each texture gets equal cell: 240×240
- ✅ Small images centered with transparency padding
- ✅ UV coordinates adjusted for actual image area
- ✅ Optimal for GPU texture cache
- ✅ Easy to add more images later

**JSON includes original dimensions:**
```json
{
  "footsteps1": {
    "width": 240,           // Cell size
    "height": 240,
    "originalWidth": 55,    // Actual image size
    "originalHeight": 57,
    "uv": {
      "u1": 0.461111,       // UV for actual image (not cell)
      "v1": 0.379166,       // (accounts for centering)
      "u2": 0.537500,
      "v2": 0.616666
    }
  }
}
```

---

## Visual Example

**Before (horizontal, as-is):**
```
350×240 atlas - inefficient layout
█████████████████░░░░   ← dot fills most width
                ░█░█    ← footsteps are tiny strips
```

**After (resize mode):**
```
720×240 atlas - efficient uniform cells
███████████████████████   ← 3 equal cells
█ dot █ foot1 █ foot2 █   ← centered within cells
```

---

## Usage

```bash
./create_atlas.sh
# When prompted, choose option 2 (resize) ← Recommended!
```

Or skip prompt:
```bash
./create_atlas.sh resize
```

---

## Performance Impact

**Horizontal mode (as-is):**
- Atlas: 350×240 = 84,000 pixels
- Wasted space: ~60% transparent
- GPU cache: Poor (non-uniform access patterns)

**Resize mode:**
- Atlas: 720×240 = 172,800 pixels
- Wasted space: ~30% (much better)
- GPU cache: Excellent (uniform cell access)
- Worth the extra ~88KB for better performance!
