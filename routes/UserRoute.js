/**
 * routes/user.js
 * ==============
 * Mounted at: /api/user
 *
 * All routes are protected (JWT required).
 *
 *   GET     /api/user/profile        Return the authenticated user's profile
 *   PATCH   /api/user/profile        Update name / email
 *   PATCH   /api/user/password       Change password (requires current password)
 *   DELETE  /api/user/account        Deactivate account (requires password confirmation)
 *   GET     /api/user/health-score   On-demand health score recalculation
 *   PATCH   /api/user/yodlee-link    Store Yodlee loginName for Open Banking sync
 */
 
const express          = require("express");
const router           = express.Router();
const { protect }      = require("../middleware/Auth");
const userController   = require("../controllers/UserController");
 
// All user routes are protected
router.use(protect);
 
router.get("/profile",       userController.getProfile);
router.patch("/profile",     userController.updateProfile);
router.patch("/password",    userController.changePassword);
router.delete("/account",    userController.deleteAccount);
router.get("/health-score",  userController.getHealthScore);
router.patch("/yodlee-link", userController.linkYodlee);
 
module.exports = router;
 