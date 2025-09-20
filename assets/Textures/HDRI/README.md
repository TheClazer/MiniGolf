# HDRI Setup Instructions

## Required File
Place the `sunny_country_road_4k.exr` HDRI texture file in this directory.

## File Requirements
- **Format**: OpenEXR (.exr)
- **Name**: `sunny_country_road_4k.exr` (exact name required)
- **Type**: Equirectangular HDRI environment map
- **Usage**: This HDRI will be used as both skybox and environment lighting for Level 1 only

## Implementation Details
- The HDRI is automatically loaded when Level 1 starts
- Level 2 and other levels will use the original background
- The HDRI provides both visual background and realistic lighting
- Environment mapping is set to `THREE.EquirectangularReflectionMapping`

## Fallback Behavior
If the HDRI file is not found or fails to load:
- An error will be logged to the console
- The game will fall back to the original background
- Level 1 will still be playable with default lighting

## File Sources
You can obtain HDRI files from:
- [HDRIHaven](https://hdri-haven.com/)
- [Poly Haven](https://polyhaven.com/hdris)
- Other HDRI texture providers

Make sure the file is in OpenEXR format for proper HDR lighting support.
