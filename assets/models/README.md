# 蓝湾渔镇模型规范

本目录是游戏运行时 3D 资源的唯一规范来源。

## 运行时格式

- 所有运行时模型统一使用 `.glb` 格式。
- 一个 Babylon 单位等于一米。
- 正前方为局部坐标 `+Z`。
- 正上方为局部坐标 `+Y`。
- 枢轴点要求：
  - 角色与宠物：脚底中心位于世界原点。
  - 建筑：地面中心位于世界原点。
  - 道具：以便于摆放的中心点为世界原点。

## 目录结构

```text
assets/models/
  model-manifest.json
  environment/
    dream_bay_terrain.glb
    stylized_water_plane.glb
  buildings/
    seaside_tavern.glb
    study_room.glb
    player_cottage.glb
    buildable_hut.glb
    buildable_cottage.glb
  props/
    fantasy_fishing_dock.glb
    volleyball_set.glb
    pet_garden_gate.glb
    buildable_lamp.glb
    buildable_planter.glb
  foliage/
    fantasy_tree_a.glb
    flower_grass_cluster.glb
  characters/
    player_base_character.glb
    npc_mayor.glb
    npc_tavern_owner.glb
  pets/
    pet_salt_puff.glb
```

## Blender 导出设置

- 导出前应用全部变换。
- 导出为 glTF Binary（`.glb`）。
- 只导出选中的对象。
- 包含材质。
- 动态角色与宠物需包含动画。
- 除非资源明确需要，否则禁用模型文件中未使用的相机与灯光。

## 材质规范

使用风格化 PBR 材质：

- `BaseColor`
- `Normal`
- `Roughness`
- 需要时使用 `Metallic`
- 灯具、魔法标志和幻想粒子使用 `Emissive`
- 可将烘焙 AO 合并到基础色，或使用单独的打包纹理

建议纹理尺寸：

- 小型道具：512
- 植被：512 或 1024
- 建筑：1024 或 2048
- 角色与宠物：1024 或 2048

## 动画命名

角色：

- `idle`
- `run`
- `fish_cast`
- `fish_reel`

宠物：

- `idle`
- `follow`
- `happy`

## 当前的回退机制

游戏从 `model-manifest.json` 加载资源。
如果缺少某个 `.glb` 文件，运行时会创建一个占地尺寸相同的简单替代网格。
这些替代网格只用于占位，不应视为最终美术资源。
