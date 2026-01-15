import { Badge } from '@chakra-ui/react';
import { TEAM_ROLES, getRoleConfig } from '../../utils/constants';

/**
 * RoleBadge Component
 *
 * Displays a user's role as a styled badge with appropriate color.
 *
 * @param {string} role - User's role (owner, admin, editor, client, view_only)
 * @param {string} size - Badge size: 'sm' | 'md' | 'lg'
 */
const RoleBadge = ({ role, size = 'sm' }) => {
  const roleConfig = getRoleConfig(role);

  // Determine badge color based on role
  const getColorScheme = (role) => {
    switch (role) {
      case TEAM_ROLES.OWNER:
        return 'purple';
      case TEAM_ROLES.ADMIN:
        return 'blue';
      case TEAM_ROLES.EDITOR:
        return 'green';
      case TEAM_ROLES.CLIENT:
        return 'orange';
      case TEAM_ROLES.VIEW_ONLY:
        return 'gray';
      default:
        return 'gray';
    }
  };

  return (
    <Badge
      colorScheme={getColorScheme(role)}
      fontSize={size === 'sm' ? 'xs' : size === 'md' ? 'sm' : 'md'}
      px={size === 'sm' ? 2 : size === 'md' ? 3 : 4}
      py={size === 'sm' ? 0.5 : size === 'md' ? 1 : 1.5}
      borderRadius="md"
      textTransform="uppercase"
      fontWeight="semibold"
    >
      {roleConfig.displayName}
    </Badge>
  );
};

export default RoleBadge;
