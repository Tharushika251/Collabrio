import { Router } from 'express';
import { createBoard, getBoard, listBoards } from '../controllers/boardController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.use(protect);
router.post('/', createBoard);
router.get('/', listBoards);
router.get('/:id', getBoard);

export default router;