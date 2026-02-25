/**
 * Calculates x and y coordinates for a point on a circle given a radius and angle.
 * Formula: x = radius * cos(theta), y = radius * sin(theta)
 *
 * @param {number} radius - The radius of the circle
 * @param {number} angleDegrees - The angle in degrees (TODO: change to radians)
 * @returns {{x: number, y: number}} Object containing x and y coordinates
 */
export function trig(radius, angleDegrees) { //TODO: change theta arg to radians not degrees
    //x = rx + radius * cos(theta) and y = ry + radius * sin(theta)
    const radians = (angleDegrees / 360) * Math.PI * 2;
    return {
        x: (radius * Math.cos(radians)),
        y: (radius * Math.sin(radians))
    };
}

/**
 * Rotates a point about another point by a given angle.
 *
 * @param {number[]} p - The point to rotate [x, y] (TODO: change to {x,y} format)
 * @param {number[]} o - The origin point to rotate about [x, y] (TODO: change to {x,y} format)
 * @param {number} theta - The rotation angle in degrees (TODO: change to radians)
 * @returns {number[]} The rotated point coordinates [x, y]
 */
export function rotatePointAboutPoint(p, o, theta) { // todo: change format of p and o to be {x,y}?
    theta = (theta / 360) * Math.PI * 2; //TODO: change theta arg to radians not degrees
    const rx = Math.cos(theta) * (p[0] - o[0]) - Math.sin(theta) * (p[1] - o[1]) + o[0];
    const ry = Math.sin(theta) * (p[0] - o[0]) + Math.cos(theta) * (p[1] - o[1]) + o[1];
    return [rx, ry];
}
