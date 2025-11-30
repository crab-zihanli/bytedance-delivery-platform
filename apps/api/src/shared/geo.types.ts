/**
 * 标准地理坐标类型：[经度, 纬度]
 * PostGIS 标准：POINT(经度 纬度)
 * 例如：[116.3975, 39.9088] (北京天安门)
 */
export type Coordinates = [number, number];

/**
 * PostGIS 核心几何类型 - 点 (Point)
 */
export interface GeoPoint {
  type: "Point";
  coordinates: Coordinates;
}

/**
 * 路线/轨迹类型 (LineString)
 * 数据库中通常存储为 JSONB 或 GEOGRAPHY(LineString, 4326)
 * 示例：[[lon1, lat1], [lon2, lat2], ...]
 */
export type RoutePath = Coordinates[];

/**
 * 几何信息 DTO (Data Transfer Object)
 * 用于数据库查询返回时，将 ST_AsGeoJSON 转换成这个格式。
 */
export interface GeoFeature {
  id: string; // 唯一标识符
  geometry: GeoPoint;
  properties: { [key: string]: unknown }; // 任何额外的属性
}
