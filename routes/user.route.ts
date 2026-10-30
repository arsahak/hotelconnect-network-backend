import { Router } from "express";
import {
  changePassword,
  createTeamMember,
  deleteTeamMember,
  getMe,
  getTeamMember,
  listTeam,
  updateAvatar,
  updateMe,
  updateTeamMember,
} from "../controllers/user.controller";
import { protect, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { upload } from "../middleware/upload";
import {
  changePasswordRules,
  createTeamMemberRules,
  updateMeRules,
  updateTeamMemberRules,
} from "../validators/user.validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: Own account and the platform team (admins)
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get the signed-in user's account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The account
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not signed in
 *   patch:
 *     summary: Update the signed-in user's own details
 *     description: Does not change role or password — see /users/me/password for that.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated account
 *       409:
 *         description: Email is already registered
 *       422:
 *         description: Validation failed
 */
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMeRules, validate, updateMe);

/**
 * @swagger
 * /users/me/password:
 *   patch:
 *     summary: Change the signed-in user's password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password updated
 *       401:
 *         description: Current password is incorrect
 */
router.patch(
  "/me/password",
  protect,
  changePasswordRules,
  validate,
  changePassword
);

/**
 * @swagger
 * /users/me/avatar:
 *   patch:
 *     summary: Upload a new avatar for the signed-in user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar updated
 *       422:
 *         description: No image file sent
 */
router.patch("/me/avatar", protect, upload.single("avatar"), updateAvatar);

/**
 * @swagger
 * /users/team:
 *   get:
 *     summary: List the platform team (admins and superadmins)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Team members, newest first
 *       403:
 *         description: Admins only
 *   post:
 *     summary: Add a team member (superadmin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, email, password, role]
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               role:
 *                 type: string
 *                 enum: [admin, superadmin]
 *     responses:
 *       201:
 *         description: Team member created
 *       403:
 *         description: Not allowed to create this role
 *       409:
 *         description: Email is already registered
 */
router.get("/team", protect, authorize("admin", "superadmin"), listTeam);
router.post(
  "/team",
  protect,
  authorize("superadmin"),
  createTeamMemberRules,
  validate,
  createTeamMember
);

/**
 * @swagger
 * /users/team/{id}:
 *   get:
 *     summary: Get one team member
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The team member
 *       404:
 *         description: Team member not found
 *   patch:
 *     summary: Update a team member (superadmin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, superadmin]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Team member updated
 *       404:
 *         description: Team member not found
 *   delete:
 *     summary: Remove a team member (superadmin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team member deleted
 *       404:
 *         description: Team member not found
 */
router.get(
  "/team/:id",
  protect,
  authorize("admin", "superadmin"),
  getTeamMember
);
router.patch(
  "/team/:id",
  protect,
  authorize("superadmin"),
  updateTeamMemberRules,
  validate,
  updateTeamMember
);
router.delete("/team/:id", protect, authorize("superadmin"), deleteTeamMember);

export default router;
