import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async validateUser(username: string, password: string) {
    const hardcodedUser = {
      id: 1,
      username: 'admin',
      password: '1234',
    };

    if (username === hardcodedUser.username && password === hardcodedUser.password) {
      const { password, ...userWithoutPassword } = hardcodedUser;
      return userWithoutPassword;
    }

    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
