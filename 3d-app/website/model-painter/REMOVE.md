# Removing the Model Painter

The Model Painter is an internal admin extra, not a client feature. It has no menu entry: admins open it by typing `/admin/model-painter`. All of it is marked `MODEL-PAINTER`.
To take it out, do these steps (paths are from `website/`):

## 1. Delete these files and folders
- `model-painter/`: this folder (the tool's source, its build script and this file)
- `public/media/model-painter/`: the built tool page
- `public/media/model-maps/`: the saved maps (back them up first if you might want them again)
- `app/Http/Controllers/Admin/ModelPainterController.php`
- `resources/js/pages/AdminModelPainter.tsx`
- `viewer/src/modelpainter-hook.js`

## 2. Delete or undo the marked lines
Search each file for `MODEL-PAINTER`.
- `resources/js/pages/Admin.tsx` (there is no menu entry or button: the page opens only by typing `/admin/model-painter`):
  - delete the line `import AdminModelPainter ...`
  - in the `const current = ...` line, put back `?? sections[0];` in place of the `?? (section === 'model-painter' ? ... : sections[0]);` part
  - delete the `: section === 'model-painter' ? ...` line
- `routes/api.php`: delete the comment line plus the 4 `model-maps` routes.
- `viewer/src/tripomesh.js`:
  - delete the line `import { areaMapTag } ...`
  - put back `const decoded = new Map();` in place of the `decodedAll` line
- `viewer/src/main.js`:
  - delete the line `import { useAreaMaps, areaMapTag } ...`
  - delete the line `await useAreaMaps(design);`
  - at the end of the `const key = ...` line in buildKit, delete ` + areaMapTag(); // MODEL-PAINTER: + areaMapTag()` and end the line with `;` again

## 3. Rebuild
- Run the viewer build and the merge gate as usual. Bump VIEWER_VERSION, then do the vite build and the app build. All three viewer copies must be identical.
- Check: `grep -rn "MODEL-PAINTER\|modelpainter\|model-maps" website/resources website/app website/routes website/viewer/src` finds nothing.

Without the saved maps, every tile shows its model's own Tripo areas again. That is how it was before the tool.
